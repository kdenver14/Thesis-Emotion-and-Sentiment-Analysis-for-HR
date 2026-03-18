import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import { sessionMetadataSchema } from "~/schemas/session";
import { generateSummary } from "~/server/services/summary";
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
  });

  if (!metadataParsed.success) {
    return NextResponse.json(
      { error: "Invalid session metadata" },
      { status: 400 },
    );
  }
  const metadata = metadataParsed.data;

  const tmpPath = path.join(os.tmpdir(), `${randomUUID()}${ext}`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);

    const inferFormData = new FormData();
    inferFormData.append(
      "file",
      new Blob([buffer], { type: file.type }),
      file.name,
    );

    const inferRes = await fetch(`${env.LOCAL_INFERENCE_URL}/infer`, {
      method: "POST",
      body: inferFormData,
    });

    if (!inferRes.ok) {
      const detail = await inferRes.text();
      console.error("Inference server error:", detail);
      return NextResponse.json({ error: "Inference failed" }, { status: 502 });
    }

    const analysis = (await inferRes.json()) as InferenceResult;

    const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
      computeAverages(analysis);

    const summaryResult = generateSummary(analysis.utterances);

    const durationSecs = analysis.utterances.at(-1)?.end_time ?? null;

    const analysisSession = await db.$transaction(async (tx) => {
      const created = await tx.analysisSession.create({
        data: {
          userId,
          employeeId: metadata.employeeId ?? null,
          title: metadata.title,
          sessionType: metadata.sessionType,
          sessionDate: metadata.sessionDate
            ? new Date(metadata.sessionDate)
            : new Date(),
          videoKey: randomUUID(),
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
            sessionId: created.id,
            startTime: u.start_time,
            endTime: u.end_time,
            text: u.text,
            emotions: JSON.stringify(u.emotions),
            sentiments: JSON.stringify(u.sentiments),
          })),
        });
      }

      return created;
    });

    return NextResponse.json({ analysis, sessionId: analysisSession.id });
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}
