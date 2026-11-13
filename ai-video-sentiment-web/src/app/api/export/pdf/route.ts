import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
  type ParsedSession,
} from "~/server/repositories/session";
import { formatTimestamp, parseDateParam } from "~/lib/dates";
import { getQuarterlyReport } from "~/actions/reports";
import type { QuarterlyReportView } from "~/server/services/reports";
import {
  countTopEmotions,
  mainScore,
  mergeEmotionCounts,
  sentimentFromCounts,
  toPercentSlices,
  topLabel,
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
    `Date: ${data.sessionDate.toLocaleDateString("en-GB")}  |  Type: ${data.sessionType}  |  Expressive: ${expressiveSummary}`,
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

function buildExecutivePdf(
  doc: JsPDFWithAutoTable,
  sessions: ParsedSession[],
  from?: Date,
  to?: Date,
) {
  const completed = sessions.filter((s) => s.status === "COMPLETED");

  doc.setFontSize(18);
  doc.text("Executive HR Sentiment Report", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  const period =
    from && to
      ? `${from.toLocaleDateString("en-GB")} – ${to.toLocaleDateString("en-GB")}`
      : "All time";
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")}  |  Period: ${period}`,
    14,
    30,
  );
  doc.setTextColor(0);

  if (completed.length === 0) {
    doc.setFontSize(11);
    doc.text("No completed sessions found for the selected period.", 14, 45);
    return;
  }

  const emotionCounts: Record<string, number> = {};
  for (const s of completed) {
    emotionCounts[s.topEmotion] = (emotionCounts[s.topEmotion] ?? 0) + 1;
  }
  // Share of all lines in the period, the same figure the dashboard shows.
  const sentiment = sentimentFromCounts(
    mergeEmotionCounts(completed.map((s) => s.sentimentCounts)),
  );

  const dominantEmotion =
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const avgExpressiveness = Math.round(
    completed.reduce((a, s) => a + s.expressivenessPct, 0) / completed.length,
  );
  const expressiveEmotionCounts: Record<string, number> = {};
  for (const s of completed) {
    if (s.expressivenessPct > 0) {
      expressiveEmotionCounts[s.topExpressiveEmotion] =
        (expressiveEmotionCounts[s.topExpressiveEmotion] ?? 0) + 1;
    }
  }
  const topExpressiveEmotion =
    Object.entries(expressiveEmotionCounts).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] ?? "—";

  doc.setFontSize(12);
  doc.text("Key Metrics", 14, 42);
  doc.autoTable({
    startY: 46,
    head: [["Metric", "Value"]],
    body: [
      ["Total sessions", String(sessions.length)],
      ["Completed sessions", String(completed.length)],
      ["Dominant emotion", dominantEmotion],
      ["Avg expressiveness", `${avgExpressiveness}%`],
      ["Top expressive emotion", topExpressiveEmotion],
    ],
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 100,
  });

  const afterMetrics = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text("Emotion Distribution", 14, afterMetrics);

  const emotionRows = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => [
      label,
      String(count),
      `${Math.round((count / completed.length) * 100)}%`,
    ]);

  doc.autoTable({
    startY: afterMetrics + 4,
    head: [["Emotion", "Sessions", "Share"]],
    body: emotionRows,
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 90,
  });

  const afterEmotion = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text("Sentiment Breakdown", 14, afterEmotion);

  doc.autoTable({
    startY: afterEmotion + 4,
    head: [["Sentiment", "Share of lines"]],
    body: [
      ["Positive", `${sentiment.positive}%`],
      ["Neutral", `${sentiment.neutral}%`],
      ["Negative", `${sentiment.negative}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 70,
  });

  const byMonth = new Map<
    string,
    { count: number; expressiveness: number[] }
  >();
  for (const s of completed) {
    const key = s.sessionDate.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
    });
    if (!byMonth.has(key)) byMonth.set(key, { count: 0, expressiveness: [] });
    const entry = byMonth.get(key)!;
    entry.count++;
    entry.expressiveness.push(s.expressivenessPct);
  }

  if (byMonth.size > 1) {
    const afterSentiment = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text("Monthly Volume & Expressiveness", 14, afterSentiment);
    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    const monthRows = Array.from(byMonth.entries()).map(([month, v]) => [
      month,
      String(v.count),
      `${Math.round(avg(v.expressiveness))}%`,
    ]);
    doc.autoTable({
      startY: afterSentiment + 4,
      head: [["Month", "Sessions", "Avg Expressive"]],
      body: monthRows,
      theme: "striped",
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 9 },
      tableWidth: 110,
    });
  }
}

// The Reports tab's quarterly comparison, as the page shows it.
function buildQuarterlyPdf(
  doc: JsPDFWithAutoTable,
  report: QuarterlyReportView,
) {
  doc.setFontSize(18);
  doc.text("Quarterly HR Sentiment Report", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB")}  |  Last four calendar quarters, all sessions`,
    14,
    30,
  );
  doc.setTextColor(0);
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const role = session.user.role ?? "STAFF";

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  const doc = new jsPDF() as JsPDFWithAutoTable;
  let filename: string;

  if (searchParams.get("report") === "quarterly") {
    // HR Director only; the action returns null for anyone else.
    const report = await getQuarterlyReport();
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buildQuarterlyPdf(doc, report);
    filename = "quarterly-report.pdf";
  } else if (sessionId) {
    const effectiveUserId = role === "STAFF" ? userId : null;
    const data = await getSessionById(sessionId, effectiveUserId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buildSessionPdf(doc, data);
    filename = `session-${sessionId.slice(0, 8)}.pdf`;
  } else {
    const fromDate = parseDateParam(searchParams.get("from"));
    const toDate = parseDateParam(searchParams.get("to"));

    const effectiveUserId = role === "STAFF" ? userId : null;
    const sessions = await getSessionsByUser(effectiveUserId, {
      from: fromDate,
      to: toDate,
    });

    if (role === "DIRECTOR") {
      buildExecutivePdf(doc, sessions, fromDate, toDate);
      filename = "executive-report.pdf";
    } else {
      doc.setFontSize(18);
      doc.text("Session Report", 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-GB")}  |  Total sessions: ${sessions.length}`,
        14,
        30,
      );
      doc.setTextColor(0);

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
        body: sessions.map((s) => {
          const base = [
            s.sessionDate.toLocaleDateString("en-GB"),
            s.title,
            s.sessionType,
            s.employee?.name ?? "—",
          ];
          // Not analysed (yet): its status, never made-up figures.
          if (s.status !== "COMPLETED") {
            return [...base, "—", "—", STATUS_LABELS[s.status] ?? s.status];
          }
          const pct = toPercentSlices(s.expressiveEmotions)[0]?.value ?? 0;
          const expressiveCell =
            s.expressivenessPct === 0
              ? "Mostly neutral"
              : `${s.topExpressiveEmotion} ${pct}% (${s.expressivenessPct}%)`;
          return [...base, s.topEmotion, s.topSentiment, expressiveCell];
        }),
        theme: "striped",
        headStyles: { fillColor: [40, 40, 40] },
        styles: { fontSize: 8 },
      });

      filename = "sessions-report.pdf";
    }
  }

  const pdfBuffer = new Uint8Array(doc.output("arraybuffer"));

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
