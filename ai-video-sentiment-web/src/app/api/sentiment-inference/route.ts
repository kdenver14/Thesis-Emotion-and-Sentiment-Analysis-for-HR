import fs from "fs/promises";
import os from "os";
import path from "path";
import { Agent } from "undici";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import { sessionMetadataSchema } from "~/schemas/session";
import { generateSummary } from "~/server/services/summary";
import type { InferenceResult, Score } from "~/types/analysis";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi"]);

// CPU inference can take several minutes — override undici's default headersTimeout
const inferenceAgent = new Agent({
  headersTimeout: 15 * 60 * 1000,
  bodyTimeout: 15 * 60 * 1000,
});

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

async function processInference(
  sessionId: string,
  buffer: Buffer,
  fileName: string,
  fileType: string,
  tmpPath: string,
) {
  try {
    const inferFormData = new FormData();
    inferFormData.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: fileType }),
      fileName,
    );

    const inferRes = await fetch(`${env.LOCAL_INFERENCE_URL}/infer`, {
      method: "POST",
      body: inferFormData,
      // @ts-expect-error -- undici dispatcher not in standard RequestInit types
      dispatcher: inferenceAgent,
    });

    if (!inferRes.ok) {
      const detail = await inferRes.text();
      console.error("Inference server error:", detail);
      throw new Error(`Inference server returned ${inferRes.status}: ${detail}`);
    }

    const analysis = (await inferRes.json()) as InferenceResult;

    const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
      computeAverages(analysis);

    const summaryResult = generateSummary(analysis.utterances);
    const durationSecs = analysis.utterances.at(-1)?.end_time ?? null;

    await db.$transaction(async (tx) => {
      await tx.analysisSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          avgEmotions: JSON.stringify(avgEmotions),
          avgSentiments: JSON.stringify(avgSentiments),
          topEmotion,
          topSentiment,
          summary: summaryResult.text,
          engagementScore: summaryResult.engagementScore,
          durationSecs,
        },
      });

      if (analysis.utterances.length > 0) {
        await tx.utterance.createMany({
          data: analysis.utterances.map((u) => ({
            sessionId,
            startTime: u.start_time,
            endTime: u.end_time,
            text: u.text,
            speaker: u.speaker ?? null,
            emotions: JSON.stringify(u.emotions),
            sentiments: JSON.stringify(u.sentiments),
          })),
        });
      }
    });

    console.log(`Inference completed for session ${sessionId}`);
  } catch (error) {
    console.error("Background inference failed:", error);
    let errorMessage = "Unknown error during inference";
    if (error instanceof Error && error.name === "TimeoutError") {
      errorMessage = `Inference timed out after 15 minutes. The video may be too long for CPU processing.`;
    } else if (error instanceof Error) {
      if (error.message === "fetch failed") {
        const cause = (error as Error & { cause?: Error }).cause;
        const causeCode =
          cause instanceof Error
            ? (cause as NodeJS.ErrnoException).code ?? cause.message
            : "";
        if (causeCode.includes("ECONNREFUSED")) {
          errorMessage = `Cannot reach inference server at ${env.LOCAL_INFERENCE_URL}. Make sure it is running.`;
        } else if (causeCode.includes("ECONNRESET")) {
          errorMessage = `Inference server dropped the connection mid-request. It may have crashed — check the Python server terminal for errors.`;
        } else {
          errorMessage = `Network error contacting inference server: ${causeCode || "fetch failed"}`;
        }
      } else if (error.message.includes("ECONNREFUSED")) {
        errorMessage = `Cannot reach inference server at ${env.LOCAL_INFERENCE_URL}. Make sure it is running.`;
      } else {
        errorMessage = error.message;
      }
    }
    await db.analysisSession
      .update({
        where: { id: sessionId },
        data: { status: "failed", summary: errorMessage },
      })
      .catch(console.error);
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

  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tmpPath, buffer);

  const analysisSession = await db.analysisSession.create({
    data: {
      userId,
      status: "processing",
      employeeId: metadata.employeeId ?? null,
      title: metadata.title,
      sessionType: metadata.sessionType,
      sessionDate: metadata.sessionDate
        ? new Date(metadata.sessionDate)
        : new Date(),
      interviewerName: metadata.interviewerName ?? null,
      videoKey: randomUUID(),
      avgEmotions: "[]",
      avgSentiments: "[]",
      topEmotion: "",
      topSentiment: "",
      summary: "",
    },
  });

  void processInference(
    analysisSession.id,
    buffer,
    file.name,
    file.type,
    tmpPath,
  );

  return NextResponse.json({ sessionId: analysisSession.id });
}
