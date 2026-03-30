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
  updateSessionEmployee,
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

export async function getSessions(
  filters: SessionFilters = {},
): Promise<ParsedSession[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getSessionsByUser(session.user.id, filters);
}

export async function getSession(
  sessionId: string,
): Promise<ParsedSessionWithUtterances | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getSessionById(sessionId, session.user.id);
}

export async function getDashboardStats(): Promise<SessionStats> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      totalSessions: 0,
      avgEngagementScore: 0,
      mostCommonEmotion: "neutral",
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    };
  }
  return getSessionStats(session.user.id);
}

export async function getSentimentTrends(
  days = 30,
): Promise<TrendPoint[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getEmotionTrendsOverTime(session.user.id, days);
}

export async function getHeatmapData(
  days = 30,
): Promise<EmotionTrendRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getEmotionHeatmap(session.user.id, days);
}

export async function getTypeBreakdown() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getSessionTypeBreakdown(session.user.id);
}

export async function fetchSessionStatus(
  sessionId: string,
): Promise<{ status: string; errorMessage: string | null } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getSessionStatusFromRepo(sessionId, session.user.id);
}

export async function removeSession(sessionId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await deleteSession(sessionId, session.user.id);
}

export async function assignSessionEmployee(
  sessionId: string,
  employeeId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await updateSessionEmployee(sessionId, session.user.id, employeeId);
}

export async function renameSessionSpeaker(
  sessionId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Speaker name cannot be empty");
  await renameSpeaker(sessionId, session.user.id, oldName, trimmed);
}

export async function setEmployeeSpeaker(
  sessionId: string,
  employeeSpeakerId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await updateEmployeeSpeaker(sessionId, session.user.id, employeeSpeakerId);
}
