import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
  type ParsedSession,
} from "~/server/repositories/session";
import { formatTimestamp, parseDateParam } from "~/lib/dates";
import { monthKey, monthLabel, monthOf } from "~/lib/periods";
import { getQuarterlyReport } from "~/actions/reports";
import type { QuarterlyReportView } from "~/server/services/reports";
import {
  countTopEmotions,
  expressiveFromCounts,
  mainScore,
  mergeEmotionCounts,
  SESSION_TYPE_LABELS,
  sentimentFromCounts,
  toPercentSlices,
  topLabel,
  type EmotionCounts,
  type ExpressiveBreakdown,
} from "~/types/analysis";

// jsPDF is browser-first but works in Node.js for basic usage
import type { jsPDF as JsPDFType } from "jspdf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { jsPDF } = require("jspdf") as { jsPDF: typeof JsPDFType };
// jspdf-autotable 5.x requires explicit registration
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyPlugin } = require("jspdf-autotable") as {
  applyPlugin: (ctor: typeof JsPDFType) => void;
};
applyPlugin(jsPDF);

type JsPDFWithAutoTable = InstanceType<typeof jsPDF> & {
  autoTable: (opts: Record<string, unknown>) => void;
  lastAutoTable: { finalY: number };
};

const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Uploading",
  PROCESSING: "Processing",
  FAILED: "Failed",
};

// The label the app shows for a session type ("Performance Review").
function typeLabel(sessionType: string): string {
  return SESSION_TYPE_LABELS[sessionType] ?? sessionType;
}

// Top non-neutral emotion and its share of expressive lines, rounded as the
// session page and the dashboard list round it, e.g. "sadness 54%".
function topEmotionText(e: ExpressiveBreakdown): string {
  if (e.expressivenessPct === 0) return "mostly neutral";
  const pct = toPercentSlices(e.expressiveEmotions)[0]?.value ?? 0;
  return `${e.topExpressiveEmotion} ${pct}%`;
}

// Every line of these sessions pooled, the way the dashboard pools them
// (getAggregateEmotionMetrics), so a report and the dashboard agree.
function pooledEmotions(sessions: ParsedSession[]): {
  counts: EmotionCounts;
  lines: number;
  expressive: ExpressiveBreakdown;
} {
  const counts = mergeEmotionCounts(sessions.map((s) => s.emotionCounts));
  const lines = sessions.reduce((n, s) => n + (s.utteranceCount ?? 0), 0);
  return { counts, lines, expressive: expressiveFromCounts(counts, lines) };
}

function speakerLabel(
  speaker: string | null,
  employeeSpeakerId: string | null,
): string {
  if (!speaker) return "—";
  return speaker === employeeSpeakerId ? "Employee" : speaker;
}

function buildSessionPdf(
  doc: JsPDFWithAutoTable,
  data: Awaited<ReturnType<typeof getSessionById>>,
) {
  if (!data) return;

  const hasSpeakers = data.utterances.some((u) => u.speaker !== null);

  doc.setFontSize(18);
  doc.text(data.title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  // The session page's emotion donut: same shares, same rounding.
  const emotionSlices = toPercentSlices(data.expressiveEmotions);
  const expressiveSummary =
    data.expressivenessPct === 0
      ? "Mostly neutral"
      : `${data.topExpressiveEmotion} ${emotionSlices[0]?.value ?? 0}% (${data.expressivenessPct}% overall)`;
  doc.text(
    `Date: ${data.sessionDate.toLocaleDateString("en-GB")}  |  Type: ${typeLabel(data.sessionType)}  |  Expressive: ${expressiveSummary}`,
    14,
    30,
  );

  let infoY = 37;
  if (data.employee) {
    doc.text(`Employee: ${data.employee.name}`, 14, infoY);
    infoY += 7;
  }

  if (hasSpeakers) {
    const speakers = [
      ...new Set(data.utterances.map((u) => u.speaker).filter(Boolean)),
    ] as string[];
    const speakerLabels = speakers.map((s) =>
      speakerLabel(s, data.employeeSpeakerId),
    );
    doc.text(`Speakers: ${speakerLabels.join(", ")}`, 14, infoY);
    infoY += 7;
  }

  doc.setTextColor(0);
  const summaryStartY = infoY + 6;
  doc.setFontSize(12);
  doc.text("Summary", 14, summaryStartY);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(data.summary, 180) as string[];
  doc.text(summaryLines, 14, summaryStartY + 8);

  const afterSummary = summaryStartY + 8 + summaryLines.length * 5 + 10;

  doc.setFontSize(12);
  doc.text("Emotions & Sentiment by Line", 14, afterSummary);

  doc.autoTable({
    startY: afterSummary + 4,
    head: [["Emotion", "Share of expressive lines"]],
    body:
      emotionSlices.length > 0
        ? emotionSlices.map((s) => [s.label, `${s.value}%`])
        : data.utterances.length > 0
          ? [["neutral", "Every line was neutral"]]
          : [["—", "No lines of speech"]],
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 80,
  });

  const emotionTableEnd = doc.lastAutoTable.finalY + 6;

  doc.autoTable({
    startY: afterSummary + 4,
    startX: 110,
    head: [["Sentiment", "Share of lines"]],
    body: Object.entries(sentimentFromCounts(data.sentimentCounts))
      .sort((a, b) => b[1] - a[1])
      .map(([label, pct]) => [label, `${pct}%`]),
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 80,
    margin: { left: 110 },
  });

  const afterTables = Math.max(emotionTableEnd, doc.lastAutoTable.finalY) + 10;

  if (data.utterances.length > 0) {
    doc.setFontSize(12);
    doc.text("Utterance Breakdown", 14, afterTables);

    const utteranceHead = hasSpeakers
      ? [["Time", "Speaker", "Text", "Top Emotion", "Top Sentiment"]]
      : [["Time", "Text", "Top Emotion", "Top Sentiment"]];

    const utteranceBody = data.utterances.map((u) => {
      const topEmotion = mainScore(u.emotions)?.label ?? "";
      const topSentiment = mainScore(u.sentiments)?.label ?? "";
      const time = `${formatTimestamp(u.startTime)}–${formatTimestamp(u.endTime)}`;
      const text = u.text.trim();

      if (hasSpeakers) {
        return [
          time,
          speakerLabel(u.speaker, data.employeeSpeakerId),
          text,
          topEmotion,
          topSentiment,
        ];
      }
      return [time, text, topEmotion, topSentiment];
    });

    const columnStyles: Record<number, Record<string, unknown>> = hasSpeakers
      ? { 2: { cellWidth: 65 } }
      : { 1: { cellWidth: 80 } };

    doc.autoTable({
      startY: afterTables + 4,
      head: utteranceHead,
      body: utteranceBody,
      theme: "striped",
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles,
    });

    // Per-speaker summary when multiple speakers exist
    if (hasSpeakers) {
      const perSpeaker = new Map<string, typeof data.utterances>();
      for (const u of data.utterances) {
        if (!u.speaker) continue;
        const label = speakerLabel(u.speaker, data.employeeSpeakerId);
        perSpeaker.set(label, [...(perSpeaker.get(label) ?? []), u]);
      }

      const speakerSummaryY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("Speaker Summary", 14, speakerSummaryY);

      const speakerBody = Array.from(perSpeaker.entries()).map(
        ([label, lines]) => {
          const counts = countTopEmotions(lines);
          const top = topLabel(counts);
          const share = Math.round(((counts[top] ?? 0) / lines.length) * 100);
          return [label, String(lines.length), `${top} (${share}% of lines)`];
        },
      );

      doc.autoTable({
        startY: speakerSummaryY + 4,
        head: [["Speaker", "Utterances", "Most frequent emotion"]],
        body: speakerBody,
        theme: "striped",
        headStyles: { fillColor: [40, 40, 40] },
        styles: { fontSize: 9 },
        tableWidth: 120,
      });
    }
  }
}

// Report title and the grey "Generated: <today>  |  <detail>" line.
function drawHeader(doc: JsPDFWithAutoTable, title: string, detail: string) {
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")}  |  ${detail}`,
    14,
    30,
  );
  doc.setTextColor(0);
}

// A section title, then a striped table; returns where the next one starts.
function drawTable(
  doc: JsPDFWithAutoTable,
  title: string,
  y: number,
  head: string[],
  body: string[][],
  tableWidth: number,
): number {
  doc.setFontSize(12);
  doc.text(title, 14, y);
  doc.autoTable({
    startY: y + 4,
    head: [head],
    body,
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth,
  });
  return doc.lastAutoTable.finalY + 10;
}

// The dashboard's figures for the same sessions: the "Top emotion" tile is
// the most frequent non-neutral emotion, "Expressive" a share of all lines.
// No lines at all shows "—", as the dashboard does.
function executiveMetrics(
  total: number,
  completed: number,
  pooled: ReturnType<typeof pooledEmotions>,
): string[][] {
  const top = toPercentSlices(pooled.expressive.expressiveEmotions)[0];
  const dominant = top
    ? `${top.label} (${top.value}% of expressive lines)`
    : pooled.lines > 0
      ? "mostly neutral"
      : "—";
  return [
    ["Total sessions", String(total)],
    ["Completed sessions", String(completed)],
    ["Dominant emotion", dominant],
    [
      "Expressive lines",
      pooled.lines > 0 ? `${pooled.expressive.expressivenessPct}%` : "—",
    ],
  ];
}

// The dashboard's "Expressive only" donut: neutral left out, zero slices
// dropped, integer shares summing to 100.
function distributionRows(
  pooled: ReturnType<typeof pooledEmotions>,
): string[][] {
  if (pooled.lines === 0) return [["—", "0", "No lines of speech"]];
  const slices = toPercentSlices(pooled.expressive.expressiveEmotions);
  if (slices.length === 0) {
    return [["neutral", String(pooled.lines), "Every line was neutral"]];
  }
  return slices.map((sl) => [
    sl.label,
    String(pooled.counts[sl.label] ?? 0),
    `${sl.value}%`,
  ]);
}

// Share of all lines in the period, the same figure the dashboard shows.
function sentimentRows(completed: ParsedSession[], lines: number): string[][] {
  const sentiment = sentimentFromCounts(
    mergeEmotionCounts(completed.map((s) => s.sentimentCounts)),
  );
  const pct = (n: number) => (lines > 0 ? `${n}%` : "—");
  return [
    ["Positive", pct(sentiment.positive)],
    ["Neutral", pct(sentiment.neutral)],
    ["Negative", pct(sentiment.negative)],
  ];
}

// Sessions per calendar month in Asia/Manila (as "Compare months" counts
// them); each month's expressive share pools its lines.
function monthlyRows(completed: ParsedSession[]): string[][] {
  const byMonth = new Map<string, { label: string; group: ParsedSession[] }>();
  for (const s of completed) {
    const month = monthOf(s.sessionDate);
    const entry = byMonth.get(monthKey(month)) ?? {
      label: monthLabel(month),
      group: [],
    };
    entry.group.push(s);
    byMonth.set(monthKey(month), entry);
  }
  return Array.from(byMonth.values(), ({ label, group }) => [
    label,
    String(group.length),
    `${pooledEmotions(group).expressive.expressivenessPct}%`,
  ]);
}

function drawExecutiveTables(
  doc: JsPDFWithAutoTable,
  total: number,
  completed: ParsedSession[],
) {
  const pooled = pooledEmotions(completed);
  const metrics = executiveMetrics(total, completed.length, pooled);
  let y = drawTable(doc, "Key Metrics", 42, ["Metric", "Value"], metrics, 100);
  const distribution = distributionRows(pooled);
  const distHead = ["Emotion", "Lines", "Share of expressive lines"];
  y = drawTable(doc, "Emotion Distribution", y, distHead, distribution, 110);
  const sentiment = sentimentRows(completed, pooled.lines);
  const sentHead = ["Sentiment", "Share of lines"];
  y = drawTable(doc, "Sentiment Breakdown", y, sentHead, sentiment, 70);
  const months = monthlyRows(completed);
  if (months.length > 1) {
    const title = "Monthly Volume & Expressiveness";
    const head = ["Month", "Sessions", "Expressive lines"];
    drawTable(doc, title, y, head, months, 110);
  }
}

function buildExecutivePdf(
  doc: JsPDFWithAutoTable,
  sessions: ParsedSession[],
  from?: Date,
  to?: Date,
) {
  const period =
    from && to
      ? `${from.toLocaleDateString("en-GB")} – ${to.toLocaleDateString("en-GB")}`
      : "All time";
  drawHeader(doc, "Executive HR Sentiment Report", `Period: ${period}`);
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  if (completed.length === 0) {
    doc.setFontSize(11);
    doc.text("No completed sessions found for the selected period.", 14, 45);
    return;
  }
  drawExecutiveTables(doc, sessions.length, completed);
}

// One "Export all" row, with the dashboard list's type label and top emotion.
function sessionListRow(s: ParsedSession): string[] {
  const base = [
    s.sessionDate.toLocaleDateString("en-GB"),
    s.title,
    typeLabel(s.sessionType),
    s.employee?.name ?? "—",
  ];
  // Not analysed (yet): its status, never made-up figures.
  if (s.status !== "COMPLETED") {
    return [...base, "—", "—", STATUS_LABELS[s.status] ?? s.status];
  }
  return [
    ...base,
    topEmotionText(s),
    s.topSentiment,
    `${s.expressivenessPct}%`,
  ];
}

// "Export all" for HR Staff and Managers: one row per session.
function buildSessionListPdf(
  doc: JsPDFWithAutoTable,
  sessions: ParsedSession[],
) {
  drawHeader(doc, "Session Report", `Total sessions: ${sessions.length}`);
  doc.autoTable({
    startY: 40,
    head: [
      [
        "Date",
        "Title",
        "Type",
        "Employee",
        "Top Emotion",
        "Sentiment",
        "Expressive",
      ],
    ],
    body: sessions.map(sessionListRow),
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 8 },
  });
}

// The Reports tab's quarterly comparison, as the page shows it.
function buildQuarterlyPdf(
  doc: JsPDFWithAutoTable,
  report: QuarterlyReportView,
) {
  drawHeader(
    doc,
    "Quarterly HR Sentiment Report",
    "Last four calendar quarters, all sessions",
  );
  doc.setFontSize(11);
  const headline = doc.splitTextToSize(report.headline, 180) as string[];
  doc.text(headline, 14, 40);

  doc.autoTable({
    startY: 40 + headline.length * 6 + 4,
    head: [
      [
        "",
        ...report.columns.map(
          (c) => `${c.label}\n${c.months}${c.toDate ? ", to date" : ""}`,
        ),
      ],
    ],
    body: report.rows.map((r) => [
      r.metric,
      ...r.cells.map((c) => (c.change ? `${c.value}\n${c.change}` : c.value)),
    ]),
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
  });

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "Sessions count in the quarter of their session date. Each change is against the quarter before. Every percentage is a share of lines of speech, except the top expressive emotion, which is a share of expressive lines.",
    14,
    doc.lastAutoTable.finalY + 8,
    { maxWidth: 180 },
  );
}

// Draws the PDF the query asks for and returns its file name, or null when
// it does not exist for this account.
async function buildRequestedPdf(
  doc: JsPDFWithAutoTable,
  params: URLSearchParams,
  userId: string,
  role: string,
): Promise<string | null> {
  if (params.get("report") === "quarterly") {
    // HR Director only; the action returns null for anyone else.
    const report = await getQuarterlyReport();
    if (!report) return null;
    buildQuarterlyPdf(doc, report);
    return "quarterly-report.pdf";
  }
  const effectiveUserId = role === "STAFF" ? userId : null;
  const sessionId = params.get("sessionId");
  if (sessionId) {
    const data = await getSessionById(sessionId, effectiveUserId);
    if (!data) return null;
    buildSessionPdf(doc, data);
    return `session-${sessionId.slice(0, 8)}.pdf`;
  }
  const from = parseDateParam(params.get("from"));
  const to = parseDateParam(params.get("to"));
  const sessions = await getSessionsByUser(effectiveUserId, { from, to });
  if (role === "DIRECTOR") {
    buildExecutivePdf(doc, sessions, from, to);
    return "executive-report.pdf";
  }
  buildSessionListPdf(doc, sessions);
  return "sessions-report.pdf";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const doc = new jsPDF() as JsPDFWithAutoTable;
  const filename = await buildRequestedPdf(
    doc,
    new URL(req.url).searchParams,
    session.user.id,
    session.user.role ?? "STAFF",
  );
  if (!filename) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdfBuffer = new Uint8Array(doc.output("arraybuffer"));

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
