import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import { generateSummary } from "~/server/services/summary";
import type { InferenceResult, Score } from "~/types/analysis";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

  const record = await db.analysisSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
    select: { status: true, errorMessage: true, inferenceJobId: true },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already settled — return immediately
  if (record.status !== "processing") {
    return NextResponse.json({
      sessionId,
      status: record.status,
      errorMessage: record.errorMessage ?? undefined,
    });
  }

  if (!record.inferenceJobId) {
    return NextResponse.json({ sessionId, status: "processing" });
  }

  // Poll FastAPI for the job result
  let jobData: { status: string; result?: InferenceResult; error?: string };
  try {
    const jobRes = await fetch(
      `${env.LOCAL_INFERENCE_URL}/jobs/${record.inferenceJobId}`,
    );
    if (!jobRes.ok) {
      return NextResponse.json({ sessionId, status: "processing" });
    }
    jobData = (await jobRes.json()) as typeof jobData;
  } catch {
    return NextResponse.json({ sessionId, status: "processing" });
  }

  if (jobData.status === "processing") {
    return NextResponse.json({ sessionId, status: "processing" });
  }

  if (jobData.status === "failed") {
    await db.analysisSession.update({
      where: { id: sessionId },
      data: { status: "failed", errorMessage: jobData.error ?? "Inference failed" },
    });
    return NextResponse.json({
      sessionId,
      status: "failed",
      errorMessage: jobData.error ?? "Inference failed",
    });
  }

  // Completed — persist results to DB
  const analysis = jobData.result!;
  const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
    computeAverages(analysis);
  const summaryResult = generateSummary(analysis.utterances);
  const durationSecs = analysis.utterances.at(-1)?.end_time ?? null;

  await db.$transaction(async (tx) => {
    await tx.analysisSession.update({
      where: { id: sessionId },
      data: {
        avgEmotions: JSON.stringify(avgEmotions),
        avgSentiments: JSON.stringify(avgSentiments),
        topEmotion,
        topSentiment,
        summary: summaryResult.text,
        engagementScore: summaryResult.engagementScore,
        durationSecs,
        status: "completed",
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

  return NextResponse.json({ sessionId, status: "completed" });
}
