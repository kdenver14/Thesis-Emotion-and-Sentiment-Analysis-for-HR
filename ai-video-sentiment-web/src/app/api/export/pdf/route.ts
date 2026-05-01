import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
  type ParsedSession,
} from "~/server/repositories/session";

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

function speakerLabel(
  speaker: string | null,
  employeeSpeakerId: string | null,
): string {
  if (!speaker) return "—";
  return speaker === employeeSpeakerId ? "Employee" : speaker;
}

function buildSessionPdf(doc: JsPDFWithAutoTable, data: Awaited<ReturnType<typeof getSessionById>>) {
  if (!data) return;

  const hasSpeakers = data.utterances.some((u) => u.speaker !== null);

  doc.setFontSize(18);
  doc.text(data.title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Date: ${data.sessionDate.toLocaleDateString("en-GB")}  |  Type: ${data.sessionType}  |  Engagement: ${data.engagementScore}/100`,
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
  doc.text("Emotion & Sentiment Averages", 14, afterSummary);

  doc.autoTable({
    startY: afterSummary + 4,
    head: [["Emotion", "Score"]],
    body: data.avgEmotions.map((e) => [
      e.label,
      `${(e.confidence * 100).toFixed(1)}%`,
    ]),
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 80,
  });

  const emotionTableEnd = doc.lastAutoTable.finalY + 6;

  doc.autoTable({
    startY: afterSummary + 4,
    startX: 110,
    head: [["Sentiment", "Score"]],
    body: data.avgSentiments.map((s) => [
      s.label,
      `${(s.confidence * 100).toFixed(1)}%`,
    ]),
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
      const topEmotion =
        [...u.emotions].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "";
      const topSentiment =
        [...u.sentiments].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "";
      const time = `${u.startTime.toFixed(1)}–${u.endTime.toFixed(1)}s`;
      const text = u.text.slice(0, 80);

      if (hasSpeakers) {
        return [time, speakerLabel(u.speaker, data.employeeSpeakerId), text, topEmotion, topSentiment];
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
      const perSpeaker = new Map<string, { count: number; emotions: Record<string, number[]> }>();
      for (const u of data.utterances) {
        if (!u.speaker) continue;
        const label = speakerLabel(u.speaker, data.employeeSpeakerId);
        if (!perSpeaker.has(label)) perSpeaker.set(label, { count: 0, emotions: {} });
        const entry = perSpeaker.get(label)!;
        entry.count++;
        for (const e of u.emotions) {
          if (!entry.emotions[e.label]) entry.emotions[e.label] = [];
          entry.emotions[e.label]!.push(e.confidence);
        }
      }

      const avg = (arr: number[]) =>
        arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

      const speakerSummaryY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text("Speaker Summary", 14, speakerSummaryY);

      const speakerBody = Array.from(perSpeaker.entries()).map(([label, v]) => {
        const topEmotion = Object.entries(v.emotions)
          .map(([l, vals]) => [l, avg(vals)] as const)
          .sort((a, b) => b[1] - a[1])[0];
        return [
          label,
          String(v.count),
          topEmotion ? `${topEmotion[0]} (${(topEmotion[1] * 100).toFixed(0)}%)` : "—",
        ];
      });

      doc.autoTable({
        startY: speakerSummaryY + 4,
        head: [["Speaker", "Utterances", "Dominant Emotion"]],
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

  const avgEngagement = Math.round(
    completed.reduce((a, s) => a + s.engagementScore, 0) / completed.length,
  );

  const emotionCounts: Record<string, number> = {};
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };

  for (const s of completed) {
    emotionCounts[s.topEmotion] = (emotionCounts[s.topEmotion] ?? 0) + 1;
    if (s.topSentiment in sentimentCounts) {
      sentimentCounts[s.topSentiment as keyof typeof sentimentCounts]++;
    }
  }

  const dominantEmotion =
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  doc.setFontSize(12);
  doc.text("Key Metrics", 14, 42);
  doc.autoTable({
    startY: 46,
    head: [["Metric", "Value"]],
    body: [
      ["Total sessions", String(sessions.length)],
      ["Completed sessions", String(completed.length)],
      ["Average engagement score", `${avgEngagement}/100`],
      ["Dominant emotion", dominantEmotion],
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

  const total = completed.length;
  doc.autoTable({
    startY: afterEmotion + 4,
    head: [["Sentiment", "Share"]],
    body: [
      ["Positive", `${Math.round((sentimentCounts.positive / total) * 100)}%`],
      ["Neutral", `${Math.round((sentimentCounts.neutral / total) * 100)}%`],
      ["Negative", `${Math.round((sentimentCounts.negative / total) * 100)}%`],
    ],
    theme: "striped",
    headStyles: { fillColor: [40, 40, 40] },
    styles: { fontSize: 9 },
    tableWidth: 70,
  });

  const byMonth = new Map<string, { count: number; engagement: number[] }>();
  for (const s of completed) {
    const key = s.sessionDate.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
    });
    if (!byMonth.has(key)) byMonth.set(key, { count: 0, engagement: [] });
    const entry = byMonth.get(key)!;
    entry.count++;
    entry.engagement.push(s.engagementScore);
  }

  if (byMonth.size > 1) {
    const afterSentiment = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text("Monthly Volume & Engagement", 14, afterSentiment);
    const avg = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / arr.length;
    const monthRows = Array.from(byMonth.entries()).map(([month, v]) => [
      month,
      String(v.count),
      `${Math.round(avg(v.engagement))}/100`,
    ]);
    doc.autoTable({
      startY: afterSentiment + 4,
      head: [["Month", "Sessions", "Avg Engagement"]],
      body: monthRows,
      theme: "striped",
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 9 },
      tableWidth: 110,
    });
  }
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

  if (sessionId) {
    const effectiveUserId = role === "STAFF" ? userId : null;
    const data = await getSessionById(sessionId, effectiveUserId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buildSessionPdf(doc, data);
    filename = `session-${sessionId.slice(0, 8)}.pdf`;
  } else {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

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
        head: [["Date", "Title", "Type", "Employee", "Top Emotion", "Sentiment", "Engagement"]],
        body: sessions.map((s) => [
          s.sessionDate.toLocaleDateString("en-GB"),
          s.title,
          s.sessionType,
          s.employee?.name ?? "—",
          s.topEmotion,
          s.topSentiment,
          `${s.engagementScore}/100`,
        ]),
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
