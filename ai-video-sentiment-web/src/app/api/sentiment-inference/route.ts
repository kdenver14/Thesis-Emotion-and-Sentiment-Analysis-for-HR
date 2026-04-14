import fs from "fs/promises"; // Testing micro CLI
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import { sessionMetadataSchema } from "~/schemas/session";
import { generateSummary } from "~/server/services/summary";
import { updateSessionResult, updateSessionFailed } from "~/server/repositories/session";
import type { InferenceResult, Score } from "~/types/analysis";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi"]);

function computeAverages(result: InferenceResult): {
  avgEmotions: Score[];
  avgSentiments: Score[];
  topEmotion: string;
  topSentiment: string;
} {
  const emotionMap: Record<string, number[]> = {};
  const sentimentMap: Record<string, number[]> = {};

  for (const u of result.utterances) {
    for (const e of u.emotions) {
      if (!emotionMap[e.label]) emotionMap[e.label] = [];
      emotionMap[e.label]!.push(e.confidence);
    }
    for (const s of u.sentiments) {
      if (!sentimentMap[s.label]) sentimentMap[s.label] = [];
      sentimentMap[s.label]!.push(s.confidence);
    }
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const avgEmotions: Score[] = Object.entries(emotionMap).map(
    ([label, vals]) => ({ label, confidence: avg(vals) }),
  );
  const avgSentiments: Score[] = Object.entries(sentimentMap).map(
    ([label, vals]) => ({ label, confidence: avg(vals) }),
  );

  avgEmotions.sort((a, b) => b.confidence - a.confidence);
  avgSentiments.sort((a, b) => b.confidence - a.confidence);

  return {
    avgEmotions,
    avgSentiments,
    topEmotion: avgEmotions[0]?.label ?? "neutral",
    topSentiment: avgSentiments[0]?.label ?? "neutral",
  };
}

async function runInferenceBackground(
  sessionId: string,
  buffer: Buffer,
  fileName: string,
  fileType: string,
  tmpPath: string,
): Promise<void> {
  try {
    const inferFormData = new FormData();
    inferFormData.append(
      "file",
      new Blob([buffer], { type: fileType }),
      fileName,
    );

    const inferRes = await fetch(`${env.LOCAL_INFERENCE_URL}/infer`, {
      method: "POST",
      body: inferFormData,
    });

    if (!inferRes.ok) {
      const detail = await inferRes.text();
      console.error("Inference server error:", detail);
      await updateSessionFailed(sessionId, "Inference server returned an error");
      return;
    }

    const analysis = (await inferRes.json()) as InferenceResult;
    const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
      computeAverages(analysis);
    const summaryResult = generateSummary(analysis.utterances);
    const durationSecs = analysis.utterances.at(-1)?.end_time ?? null;

    await updateSessionResult(sessionId, {
      avgEmotions: JSON.stringify(avgEmotions),
      avgSentiments: JSON.stringify(avgSentiments),
      topEmotion,
      topSentiment,
      summary: summaryResult.text,
      engagementScore: summaryResult.engagementScore,
      durationSecs,
      utterances: analysis.utterances.map((u) => ({
        startTime: u.start_time,
        endTime: u.end_time,
        text: u.text,
        speaker: u.speaker ?? null,
        emotions: JSON.stringify(u.emotions),
        sentiments: JSON.stringify(u.sentiments),
      })),
    });
  } catch (error) {
    console.error("Background inference error:", error);
    await updateSessionFailed(
      sessionId,
      error instanceof Error ? error.message : "Unknown error",
    ).catch((e: unknown) => console.error("Failed to mark session failed:", e));
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${ext}` },
      { status: 400 },
    );
  }

  const metadataParsed = sessionMetadataSchema.safeParse({
    title:
      formData.get("title") ??
      `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType: formData.get("sessionType") ?? "general",
    employeeId: formData.get("employeeId") ?? undefined,
    sessionDate: formData.get("sessionDate") ?? undefined,
    interviewerName: formData.get("interviewerName") ?? undefined,
  });

  if (!metadataParsed.success) {
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 },
    );
  }
  const metadata = metadataParsed.data;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Failed to read file" }, { status: 400 });
  }

  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}${ext}`);

  try {
    await fs.writeFile(tmpPath, buffer);
  } catch {
    return NextResponse.json(
      { error: "Failed to write temp file" },
      { status: 500 },
    );
  }

  const analysisSession = await db.analysisSession.create({
    data: {
      userId,
      employeeId: metadata.employeeId ?? null,
      title: metadata.title,
      sessionType: metadata.sessionType,
      sessionDate: metadata.sessionDate
        ? new Date(metadata.sessionDate)
        : new Date(),
      interviewerName: metadata.interviewerName ?? null,
      videoKey: randomUUID(),
      status: "PROCESSING",
    },
  });

  // Fire-and-forget: Node.js event loop keeps this alive until the Promise settles
  void runInferenceBackground(
    analysisSession.id,
    buffer,
    file.name,
    file.type,
    tmpPath,
  );

  return NextResponse.json({ sessionId: analysisSession.id });
}
