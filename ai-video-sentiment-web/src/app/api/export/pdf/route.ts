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

function buildSessionPdf(doc: JsPDFWithAutoTable, data: Awaited<ReturnType<typeof getSessionById>>) {
  if (!data) return;

  doc.setFontSize(18);
  doc.text(data.title, 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Date: ${data.sessionDate.toLocaleDateString("en-GB")}  |  Type: ${data.sessionType}  |  Engagement: ${data.engagementScore}/100`,
    14,
    30,
  );

  if (data.employee) {
    doc.text(`Employee: ${data.employee.name}`, 14, 37);
  }

  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.text("Summary", 14, 50);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(data.summary, 180) as string[];
  doc.text(summaryLines, 14, 58);

  const afterSummary = 58 + summaryLines.length * 5 + 10;

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

    doc.autoTable({
      startY: afterTables + 4,
      head: [["Time", "Text", "Top Emotion", "Top Sentiment"]],
      body: data.utterances.map((u) => [
        `${u.startTime.toFixed(1)}–${u.endTime.toFixed(1)}s`,
        u.text.slice(0, 80),
        [...u.emotions].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "",
        [...u.sentiments].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "",
      ]),
      theme: "striped",
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 1: { cellWidth: 80 } },
    });
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

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
