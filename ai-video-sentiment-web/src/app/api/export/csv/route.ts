import { NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
} from "~/server/repositories/session";
import { parseDateParam } from "~/lib/dates";

// CSV formula injection: a cell whose first char is one of these is
// executed as a formula by Excel/Sheets. Prefix with a single quote to
// neutralize. Applied to every string cell, not a per-column whitelist.
const CSV_INJECTION_CHARS = new Set(["=", "+", "-", "@", "\t", "\r", "\0"]);

function sanitizeCsvValue(value: unknown): unknown {
  if (
    typeof value === "string" &&
    value.length > 0 &&
    CSV_INJECTION_CHARS.has(value[0]!)
  ) {
    return `'${value}`;
  }
  return value;
}

function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    out[key] = sanitizeCsvValue(val);
  }
  return out as T;
}

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

    const sessionTopExprPct = Math.round(
      (data.expressiveEmotions[0]?.confidence ?? 0) * 100,
    );

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
      expressiveness_pct: data.expressivenessPct,
      top_expressive_emotion: data.topExpressiveEmotion,
      top_expressive_pct: sessionTopExprPct,
    }));

    csv = Papa.unparse(rows.map(sanitizeRow));
    filename = `session-${sessionId.slice(0, 8)}.csv`;
  } else {
    const sessions = await getSessionsByUser(effectiveUserId, {
      from: parseDateParam(searchParams.get("from")),
      to: parseDateParam(searchParams.get("to")),
    });

    const rows = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.sessionDate.toISOString(),
      session_type: s.sessionType,
      employee: s.employee?.name ?? "",
      top_emotion: s.topEmotion,
      top_sentiment: s.topSentiment,
      expressiveness_pct: s.expressivenessPct,
      top_expressive_emotion: s.topExpressiveEmotion,
      top_expressive_pct: Math.round(
        (s.expressiveEmotions[0]?.confidence ?? 0) * 100,
      ),
      utterance_count: s.utteranceCount ?? 0,
      duration_secs: s.durationSecs ?? "",
    }));

    csv = Papa.unparse(rows.map(sanitizeRow));
    filename = "sessions-export.csv";
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
