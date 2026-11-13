import { NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "~/server/auth";
import {
  getSessionById,
  getSessionsByUser,
} from "~/server/repositories/session";
import { parseDateParam } from "~/lib/dates";
import { mainScore, toPercentSlices } from "~/types/analysis";

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

    // Same rounding as the session page's emotion donut.
    const sessionTopExprPct =
      toPercentSlices(data.expressiveEmotions)[0]?.value ?? 0;

    const rows = data.utterances.map((u) => ({
      session_id: data.id,
      session_title: data.title,
      session_date: data.sessionDate.toISOString(),
      session_type: data.sessionType,
      employee: data.employee?.name ?? "",
      utterance_start: u.startTime,
      utterance_end: u.endTime,
      // As the transcript names them ("Employee" for the mapped speaker).
      speaker:
        u.speaker !== null && u.speaker === data.employeeSpeakerId
          ? "Employee"
          : (u.speaker ?? ""),
      text: u.text,
      top_emotion: mainScore(u.emotions)?.label ?? "",
      top_sentiment: mainScore(u.sentiments)?.label ?? "",
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

    const rows = sessions.map((s) => {
      // A session not analysed (yet) has no figures: blank, never defaults.
      const done = s.status === "COMPLETED";
      return {
        id: s.id,
        title: s.title,
        date: s.sessionDate.toISOString(),
        session_type: s.sessionType,
        status: s.status,
        employee: s.employee?.name ?? "",
        top_emotion: done ? s.topEmotion : "",
        top_sentiment: done ? s.topSentiment : "",
        expressiveness_pct: done ? s.expressivenessPct : "",
        top_expressive_emotion: done ? s.topExpressiveEmotion : "",
        top_expressive_pct: done
          ? (toPercentSlices(s.expressiveEmotions)[0]?.value ?? 0)
          : "",
        utterance_count: done ? (s.utteranceCount ?? 0) : "",
        duration_secs: s.durationSecs ?? "",
      };
    });

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
