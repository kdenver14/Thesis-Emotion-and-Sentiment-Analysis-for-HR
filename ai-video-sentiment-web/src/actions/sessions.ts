"use server";

import { auth } from "~/server/auth";
import {
  getSessionsByUser,
  getSessionById,
  getSessionStats,
  getEmotionTrendsOverTime,
  getEmotionHeatmap,
  getSessionTypeBreakdown,
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
  type SessionStats,
  type TrendPoint,
  type EmotionTrendRow,
} from "~/server/repositories/session";

async function getEffectiveUserId(): Promise<string | null | undefined> {
  const session = await auth();
  if (!session?.user?.id) return undefined;
  return session.user.isAdmin ? null : session.user.id;
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

export async function getDashboardStats(): Promise<SessionStats> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) {
    return {
      totalSessions: 0,
      avgEngagementScore: 0,
      mostCommonEmotion: "neutral",
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    };
  }
  return getSessionStats(userId);
}

export async function getSentimentTrends(
  days = 30,
): Promise<TrendPoint[]> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return [];
  return getEmotionTrendsOverTime(userId, days);
}

export async function getHeatmapData(
  days = 30,
): Promise<EmotionTrendRow[]> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return [];
  return getEmotionHeatmap(userId, days);
}

export async function getTypeBreakdown() {
  const userId = await getEffectiveUserId();
  if (userId === undefined) return [];
  return getSessionTypeBreakdown(userId);
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
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Session title cannot be empty");
  await updateSessionTitle(sessionId, userId, trimmed);
}

export async function removeSession(sessionId: string): Promise<void> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await deleteSession(sessionId, userId);
}

export async function removeSessionsBulk(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await deleteSessionsBulk(sessionIds, userId);
}

export async function assignSessionEmployee(
  sessionId: string,
  employeeId: string | null,
): Promise<void> {
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await updateSessionEmployee(sessionId, userId, employeeId);
}

export async function renameSessionSpeaker(
  sessionId: string,
  oldName: string,
  newName: string,
): Promise<void> {
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
  const userId = await getEffectiveUserId();
  if (userId === undefined) throw new Error("Unauthorized");
  await updateEmployeeSpeaker(sessionId, userId, employeeSpeakerId);
}
