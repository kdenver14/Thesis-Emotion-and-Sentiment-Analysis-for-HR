import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  const doc = new jsPDF() as JsPDFWithAutoTable;
  let filename: string;

  if (sessionId) {
    const data = await getSessionById(sessionId, userId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    buildSessionPdf(doc, data);
    filename = `session-${sessionId.slice(0, 8)}.pdf`;
  } else {
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const sessions = await getSessionsByUser(userId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

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

  const pdfBuffer = new Uint8Array(doc.output("arraybuffer"));

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
