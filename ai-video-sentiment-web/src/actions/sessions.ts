"use server";

import {
  getSessionsByUser,
  getSessionById,
  getAggregateEmotionMetrics,
  deleteSession,
  deleteSessionsBulk,
  updateSessionEmployee,
  updateSessionTitle,
  updateEmployeeSpeaker,
  renameSpeaker,
  getSessionStatus as getSessionStatusFromRepo,
  type SessionFilters,
  type ParsedSession,
  type ParsedSessionWithUtterances,
} from "~/server/repositories/session";
import { effectiveScopeUserId, requireMutator } from "~/server/auth/guards";

async function getEffectiveUserId(): Promise<string | null | undefined> {
  return effectiveScopeUserId();
}

async function assertCanMutate(): Promise<void> {
  await requireMutator();
}

export async function getSessions(
  filters: SessionFilters = {},
): Promise<ParsedSession[]> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return [];
  return getSessionsByUser(userId, filters);
}

export async function getSession(
  sessionId: string,
): Promise<ParsedSessionWithUtterances | null> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return null;
  return getSessionById(sessionId, userId);
}

export async function getDashboardEmotionMetrics() {
  const userId = await getEffectiveUserId();
  if (userId === undefined) {
    return {
      expressive: {
        expressivenessPct: 0,
        topExpressiveEmotion: "neutral",
        expressiveEmotions: [],
      },
      allEmotions: { topEmotion: "neutral", topEmotionPct: 0, total: 0 },
    };
  }
  return getAggregateEmotionMetrics(userId);
}

export async function fetchSessionStatus(
  sessionId: string,
): Promise<{ status: string; errorMessage: string | null } | null> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return null;
  return getSessionStatusFromRepo(sessionId, userId);
}

export async function renameSession(
  sessionId: string,
  title: string,
): Promise<void> {
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Session title cannot be empty");
  await updateSessionTitle(sessionId, userId, trimmed);
}

export async function removeSession(sessionId: string): Promise<void> {
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await deleteSession(sessionId, userId);
}

export async function removeSessionsBulk(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await deleteSessionsBulk(sessionIds, userId);
}

export async function assignSessionEmployee(
  sessionId: string,
  employeeId: string | null,
): Promise<void> {
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await updateSessionEmployee(sessionId, userId, employeeId);
}

export async function renameSessionSpeaker(
  sessionId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Speaker name cannot be empty");
  await renameSpeaker(sessionId, userId, oldName, trimmed);
}

export async function setEmployeeSpeaker(
  sessionId: string,
  employeeSpeakerId: string | null,
): Promise<void> {
  await assertCanMutate();
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await updateEmployeeSpeaker(sessionId, userId, employeeSpeakerId);
}
