import fs from "fs/promises"; // Testing micro CLI
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  sessionMetadataSchema,
  onboardingCandidateSchema,
  meetingParticipantsSchema,
} from "~/schemas/session";
import { inferenceResultSchema } from "~/schemas/inference";
import { generateSummary } from "~/server/services/summary";
import { updateSessionResult, updateSessionFailed } from "~/server/repositories/session";
import { computeAverages, type InferenceResult } from "~/types/analysis";

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".avi"]);
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

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

    const parsed = inferenceResultSchema.safeParse(await inferRes.json());
    if (!parsed.success) {
      console.error("Invalid inference payload:", parsed.error.issues);
      await updateSessionFailed(
        sessionId,
        "Inference server returned an invalid response",
      );
      return;
    }
    const analysis: InferenceResult = parsed.data;
    const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
      computeAverages(analysis.utterances);
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

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 100 MB upload limit" },
      { status: 413 },
    );
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
    sessionType: formData.get("sessionType") ?? "interview",
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

  // Meeting: declared participants. Validated + ownership-scoped before
  // any file work so an invalid request cannot leave an orphan session.
  let participantEmployeeIds: string[] = [];
  if (metadata.sessionType === "meeting") {
    const raw = formData.get("participantEmployeeIds");
    if (typeof raw !== "string") {
      return NextResponse.json(
        { error: "A meeting requires participants" },
        { status: 400 },
      );
    }
    let parsedIds: unknown;
    try {
      parsedIds = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Invalid participant data" },
        { status: 400 },
      );
    }
    const result = meetingParticipantsSchema.safeParse(parsedIds);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? "Invalid participants" },
        { status: 400 },
      );
    }
    const ids = result.data;
    // STAFF may only attach their own employees; MANAGER/DIRECTOR any.
    const role = session.user.role ?? "STAFF";
    const visible = await db.employee.findMany({
      where: { id: { in: ids }, ...(role === "STAFF" ? { userId } : {}) },
      select: { id: true },
    });
    if (visible.length !== ids.length) {
      return NextResponse.json(
        { error: "Unknown or unauthorized participant" },
        { status: 400 },
      );
    }
    participantEmployeeIds = ids;
  }

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

  let candidateData: {
    name: string;
    position?: string;
    email?: string;
    phone?: string;
    age?: number;
    gender?: string;
  } | null = null;
  if (metadata.sessionType === "interview") {
    const raw = formData.get("onboardingCandidate");
    if (raw && typeof raw === "string") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Invalid candidate data" }, { status: 400 });
      }
      const candidateParsed = onboardingCandidateSchema.safeParse(parsed);
      if (!candidateParsed.success) {
        return NextResponse.json({ error: "Candidate name is required for interview sessions" }, { status: 400 });
      }
      candidateData = {
        name: candidateParsed.data.name,
        position: candidateParsed.data.position,
        email: candidateParsed.data.email || undefined,
        phone: candidateParsed.data.phone,
        age: candidateParsed.data.age,
        gender: candidateParsed.data.gender,
      };
    }
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

  if (candidateData) {
    await db.onboardingCandidate.create({
      data: { sessionId: analysisSession.id, ...candidateData },
    });
  }

  if (participantEmployeeIds.length > 0) {
    await db.sessionParticipant.createMany({
      data: participantEmployeeIds.map((employeeId) => ({
        sessionId: analysisSession.id,
        employeeId,
      })),
    });
  }

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
