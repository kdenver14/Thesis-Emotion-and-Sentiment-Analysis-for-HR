import { NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
} from "~/server/repositories/session";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const role = session.user.role ?? "STAFF";
  const effectiveUserId = role === "STAFF" ? userId : null;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  let csv: string;
  let filename: string;

  if (sessionId) {
    const data = await getSessionById(sessionId, effectiveUserId);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rows = data.utterances.map((u) => ({
      session_id: data.id,
      session_title: data.title,
      session_date: data.sessionDate.toISOString(),
      session_type: data.sessionType,
      employee: data.employee?.name ?? "",
      utterance_start: u.startTime,
      utterance_end: u.endTime,
      text: u.text,
      top_emotion: [...u.emotions].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "",
      top_sentiment: [...u.sentiments].sort((a, b) => b.confidence - a.confidence)[0]?.label ?? "",
    }));

    csv = Papa.unparse(rows);
    filename = `session-${sessionId.slice(0, 8)}.csv`;
  } else {
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const sessions = await getSessionsByUser(effectiveUserId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    const rows = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.sessionDate.toISOString(),
      session_type: s.sessionType,
      employee: s.employee?.name ?? "",
      top_emotion: s.topEmotion,
      top_sentiment: s.topSentiment,
      utterance_count: s.utteranceCount ?? 0,
      duration_secs: s.durationSecs ?? "",
    }));

    csv = Papa.unparse(rows);
    filename = "sessions-export.csv";
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
