"use server";

import { randomUUID } from "crypto";
import path from "path";
import { db } from "~/server/db";
import { getMutatorOrError } from "~/server/auth/guards";
import { env } from "~/env";
import {
  sessionMetadataSchema,
  onboardingCandidateSchema,
  meetingParticipantsSchema,
} from "~/schemas/session";
import {
  presignPutUrl,
  presignGetUrl,
  headObject,
  deleteObject,
  r2Configured,
} from "~/server/storage/r2";
import {
  markSessionProcessing,
  updateSessionFailed,
} from "~/server/repositories/session";
import type { SessionMetadataInput } from "~/types/analysis";

const ALLOWED_EXT = new Set([".mp4", ".mov", ".avi"]);
const MAX_VIDEO_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB (plan-locked cap)

type FileMeta = { name: string; type: string; size: number };
type CandidateData = {
  name: string;
  position?: string;
  email?: string;
  phone?: string;
};

// Server actions are public RPC: every field is re-validated here, not
// trusted from the client. This is the same validation route.ts did, moved
// in front of a direct-to-R2 upload (the bytes no longer pass through Next).

function parseMetadata(metadata: SessionMetadataInput) {
  return sessionMetadataSchema.safeParse({
    title:
      metadata.title || `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType: metadata.sessionType ?? "interview",
    employeeId: metadata.employeeId ?? undefined,
    sessionDate: metadata.sessionDate ?? undefined,
    interviewerName: metadata.interviewerName ?? undefined,
  });
}

async function resolveParticipants(
  metadata: SessionMetadataInput,
  userId: string,
  role: string,
): Promise<{ ids: string[] } | { error: string }> {
  const parsed = meetingParticipantsSchema.safeParse(
    metadata.participantEmployeeIds ?? [],
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid participants" };
  }
  const ids = parsed.data;
  // STAFF may only attach their own employees; MANAGER/DIRECTOR any.
  const visible = await db.employee.findMany({
    where: { id: { in: ids }, ...(role === "STAFF" ? { userId } : {}) },
    select: { id: true },
  });
  if (visible.length !== ids.length) {
    return { error: "Unknown or unauthorized participant" };
  }
  return { ids };
}

function resolveCandidate(
  metadata: SessionMetadataInput,
): { data: CandidateData | null } | { error: string } {
  if (!metadata.onboardingCandidate) return { data: null };
  const parsed = onboardingCandidateSchema.safeParse(
    metadata.onboardingCandidate,
  );
  if (!parsed.success) {
    return { error: "Candidate name is required for interview sessions" };
  }
  return {
    data: {
      name: parsed.data.name,
      position: parsed.data.position,
      // Schema allows "" (z.literal("")); normalize empty -> undefined so a
      // blank candidate email is not stored as an empty string.
      email: parsed.data.email ? parsed.data.email : undefined,
      phone: parsed.data.phone,
    },
  };
}

export async function createUpload(
  metadata: SessionMetadataInput,
  file: FileMeta,
): Promise<{ sessionId: string; uploadUrl: string } | { error: string }> {
  const guard = await getMutatorOrError();
  if (!guard.ok) return { error: guard.error };
  const userId = guard.user.id;
  if (!r2Configured() || !env.MODAL_TRIGGER_URL) {
    return { error: "Inference service is not configured" };
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return { error: `Unsupported file type: ${ext}` };
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
    return { error: "File exceeds the 3 GB upload limit" };
  }

  const metaParsed = parseMetadata(metadata);
  if (!metaParsed.success) return { error: "Invalid session metadata" };
  const meta = metaParsed.data;

  let participantEmployeeIds: string[] = [];
  if (meta.sessionType === "meeting") {
    const r = await resolveParticipants(
      metadata,
      userId,
      guard.user.role,
    );
    if ("error" in r) return { error: r.error };
    participantEmployeeIds = r.ids;
  }

  let candidateData: CandidateData | null = null;
  if (meta.sessionType === "interview") {
    const r = resolveCandidate(metadata);
    if ("error" in r) return { error: r.error };
    candidateData = r.data;
  }

  const objectKey = `uploads/${randomUUID()}${ext}`;
  const created = await db.analysisSession.create({
    data: {
      userId,
      employeeId: meta.employeeId ?? null,
      title: meta.title,
      sessionType: meta.sessionType,
      sessionDate: meta.sessionDate ? new Date(meta.sessionDate) : new Date(),
      interviewerName: meta.interviewerName ?? null,
      videoKey: objectKey,
      status: "UPLOADING",
    },
    select: { id: true },
  });

  if (candidateData) {
    await db.onboardingCandidate.create({
      data: { sessionId: created.id, ...candidateData },
    });
  }
  if (participantEmployeeIds.length > 0) {
    await db.sessionParticipant.createMany({
      data: participantEmployeeIds.map((employeeId) => ({
        sessionId: created.id,
        employeeId,
      })),
    });
  }

  const uploadUrl = await presignPutUrl(
    objectKey,
    file.type || "application/octet-stream",
  );
  return { sessionId: created.id, uploadUrl };
}

// Called after the client confirms the R2 PUT finished. Verifies the object
// really landed (presigned PUT cannot bound size; the client is untrusted),
// flips UPLOADING -> PROCESSING, then asks Modal to start. Idempotent.
export async function triggerInference(
  sessionId: string,
): Promise<{ ok: true } | { error: string }> {
  const guard = await getMutatorOrError();
  if (!guard.ok) return { error: guard.error };
  const userId = guard.user.id;

  const triggerUrl = env.MODAL_TRIGGER_URL;
  if (!triggerUrl) return { error: "Inference service is not configured" };

  const row = await db.analysisSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, videoKey: true, status: true },
  });
  if (!row) return { error: "Session not found" };
  if (row.status !== "UPLOADING") return { ok: true }; // already triggered

  const head = await headObject(row.videoKey);
  if (!head) {
    await updateSessionFailed(sessionId, "Upload was not received");
    return { error: "Upload was not received" };
  }
  if (head.size > MAX_VIDEO_BYTES) {
    await deleteObject(row.videoKey);
    await updateSessionFailed(sessionId, "Video exceeds the 3 GB limit");
    return { error: "Video exceeds the 3 GB limit" };
  }

  await markSessionProcessing(sessionId);

  try {
    const videoUrl = await presignGetUrl(row.videoKey);
    const res = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MODAL_TRIGGER_TOKEN ?? ""}`,
      },
      body: JSON.stringify({
        sessionId,
        videoUrl,
        ext: path.extname(row.videoKey).toLowerCase() || ".mp4",
        callbackUrl: `${env.APP_URL}/api/inference-callback`,
      }),
    });
    if (!res.ok) {
      await updateSessionFailed(sessionId, "Could not start inference");
      return { error: "Could not start inference" };
    }
  } catch {
    await updateSessionFailed(sessionId, "Could not reach inference service");
    return { error: "Could not reach inference service" };
  }
  return { ok: true };
}
