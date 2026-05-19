import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { inferenceResultSchema } from "~/schemas/inference";
import { generateSummary } from "~/server/services/summary";
import {
  updateSessionResult,
  updateSessionFailed,
} from "~/server/repositories/session";
import { deleteObject } from "~/server/storage/r2";
import { computeAverages } from "~/types/analysis";

export const runtime = "nodejs"; // HMAC (node:crypto), not edge

const SIG_HEADER = "x-inference-signature"; // "sha256=<hex>"

// Verify the EXACT bytes Modal POSTed before any JSON parse. req.json() first
// would discard the raw body and any whitespace/key-order drift would break
// verification.
function verify(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Best-effort: a delete failure must not fail the callback (results are
// already persisted). Orphaned objects are swept separately if needed.
async function purge(videoKey: string | undefined): Promise<void> {
  if (!videoKey) return;
  await deleteObject(videoKey).catch(() => undefined);
}

export async function POST(req: Request) {
  const secret = env.INFERENCE_CALLBACK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verify(raw, req.headers.get(SIG_HEADER), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as {
    sessionId?: unknown;
    status?: unknown;
    result?: unknown;
    error?: unknown;
  };
  if (typeof payload.sessionId !== "string") {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  const sessionId = payload.sessionId;

  const sessionRow = await db.analysisSession.findUnique({
    where: { id: sessionId },
    select: { status: true, videoKey: true },
  });
  if (!sessionRow) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
  // Idempotent: a retried/duplicate callback on a terminal session is a
  // no-op, never a double write.
  if (sessionRow.status === "COMPLETED" || sessionRow.status === "FAILED") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (payload.status === "failed") {
    const msg =
      typeof payload.error === "string" ? payload.error : "Inference failed";
    await updateSessionFailed(sessionId, msg);
    await purge(sessionRow.videoKey);
    return NextResponse.json({ ok: true });
  }

  const parsed = inferenceResultSchema.safeParse(payload.result);
  if (!parsed.success) {
    await updateSessionFailed(
      sessionId,
      "Inference returned an invalid response",
    );
    await purge(sessionRow.videoKey);
    return NextResponse.json({ ok: true });
  }

  const analysis = parsed.data;
  const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
    computeAverages(analysis.utterances);
  const summary = generateSummary(analysis.utterances);

  await updateSessionResult(sessionId, {
    avgEmotions: JSON.stringify(avgEmotions),
    avgSentiments: JSON.stringify(avgSentiments),
    topEmotion,
    topSentiment,
    summary: summary.text,
    engagementScore: summary.engagementScore,
    durationSecs: analysis.utterances.at(-1)?.end_time ?? null,
    utterances: analysis.utterances.map((u) => ({
      startTime: u.start_time,
      endTime: u.end_time,
      text: u.text,
      speaker: u.speaker ?? null,
      emotions: JSON.stringify(u.emotions),
      sentiments: JSON.stringify(u.sentiments),
    })),
  });
  await purge(sessionRow.videoKey);
  return NextResponse.json({ ok: true });
}
