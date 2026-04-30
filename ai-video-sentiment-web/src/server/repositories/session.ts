import { db } from "~/server/db";
import type { Score } from "~/types/analysis";

export interface ParsedUtterance {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  speaker: string | null;
  emotions: Score[];
  sentiments: Score[];
}

export interface ParsedSession {
  id: string;
  title: string;
  sessionType: string;
  sessionDate: Date;
  topEmotion: string;
  topSentiment: string;
  avgEmotions: Score[];
  avgSentiments: Score[];
  summary: string;
  engagementScore: number;
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: { id: string; name: string; department: string | null } | null;
  handledBy: { id: string; name: string | null };
  status: string;
  errorMessage: string | null;
  utteranceCount?: number;
}

export interface OnboardingCandidateRow {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
}

export interface ParsedSessionWithUtterances extends ParsedSession {
  utterances: ParsedUtterance[];
  onboardingCandidate: OnboardingCandidateRow | null;
}

export interface SessionStats {
  totalSessions: number;
  avgEngagementScore: number;
  mostCommonEmotion: string;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
}

export interface SessionFilters {
  employeeId?: string;
  sessionType?: string;
  from?: Date;
  to?: Date;
}

export interface TrendPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avgEngagement: number;
}

export interface EmotionTrendRow {
  date: string;
  emotions: Record<string, number>;
}

function parseSession(raw: {
  id: string;
  title: string;
  sessionType: string;
  sessionDate: Date;
  topEmotion: string;
  topSentiment: string;
  avgEmotions: string;
  avgSentiments: string;
  summary: string;
  engagementScore: number;
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: { id: string; name: string; department: string | null } | null;
  user: { id: string; name: string | null };
  status: string;
  errorMessage: string | null;
  _count?: { utterances: number };
}): ParsedSession {
  return {
    id: raw.id,
    title: raw.title,
    sessionType: raw.sessionType,
    sessionDate: raw.sessionDate,
    topEmotion: raw.topEmotion,
    topSentiment: raw.topSentiment,
    avgEmotions: JSON.parse(raw.avgEmotions) as Score[],
    avgSentiments: JSON.parse(raw.avgSentiments) as Score[],
    summary: raw.summary,
    engagementScore: raw.engagementScore,
    durationSecs: raw.durationSecs,
    interviewerName: raw.interviewerName,
    createdAt: raw.createdAt,
    employeeId: raw.employeeId,
    employeeSpeakerId: raw.employeeSpeakerId,
    employee: raw.employee,
    handledBy: raw.user,
    status: raw.status,
    errorMessage: raw.errorMessage,
    utteranceCount: raw._count?.utterances,
  };
}

const SESSION_SELECT = {
  id: true,
  title: true,
  sessionType: true,
  sessionDate: true,
  topEmotion: true,
  topSentiment: true,
  avgEmotions: true,
  avgSentiments: true,
  summary: true,
  engagementScore: true,
  durationSecs: true,
  interviewerName: true,
  createdAt: true,
  employeeId: true,
  employeeSpeakerId: true,
  status: true,
  errorMessage: true,
  employee: {
    select: { id: true, name: true, department: true },
  },
  user: {
    select: { id: true, name: true },
  },
  _count: { select: { utterances: true } },
} as const;

export async function getSessionsByUser(
  userId: string | null,
  filters: SessionFilters = {},
): Promise<ParsedSession[]> {
  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.sessionType) where.sessionType = filters.sessionType;
  if (filters.from ?? filters.to) {
    where.sessionDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const rows = await db.analysisSession.findMany({
    where,
    select: SESSION_SELECT,
    orderBy: { sessionDate: "desc" },
  });

  return rows.map(parseSession);
}

export async function getSessionById(
  sessionId: string,
  userId: string | null,
): Promise<ParsedSessionWithUtterances | null> {
  const row = await db.analysisSession.findFirst({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    select: {
      ...SESSION_SELECT,
      utterances: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          text: true,
          speaker: true,
          emotions: true,
          sentiments: true,
        },
        orderBy: { startTime: "asc" },
      },
      onboardingCandidate: {
        select: { id: true, name: true, position: true, email: true, phone: true },
      },
    },
  });

  if (!row) return null;

  const base = parseSession(row);
  const utterances: ParsedUtterance[] = row.utterances.map((u) => ({
    id: u.id,
    startTime: u.startTime,
    endTime: u.endTime,
    text: u.text,
    speaker: u.speaker,
    emotions: JSON.parse(u.emotions) as Score[],
    sentiments: JSON.parse(u.sentiments) as Score[],
  }));

  return { ...base, utterances, onboardingCandidate: row.onboardingCandidate ?? null };
}

export async function getSessionStats(userId: string | null): Promise<SessionStats> {
  const where: Record<string, unknown> = { status: "COMPLETED" };
  if (userId) where.userId = userId;

  const sessions = await db.analysisSession.findMany({
    where,
    select: {
      topEmotion: true,
      topSentiment: true,
      engagementScore: true,
    },
  });

  const total = sessions.length;

  if (total === 0) {
    return {
      totalSessions: 0,
      avgEngagementScore: 0,
      mostCommonEmotion: "neutral",
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    };
  }

  const emotionCounts: Record<string, number> = {};
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  let totalEngagement = 0;

  for (const s of sessions) {
    emotionCounts[s.topEmotion] = (emotionCounts[s.topEmotion] ?? 0) + 1;
    if (s.topSentiment in sentimentCounts) {
      sentimentCounts[s.topSentiment as keyof typeof sentimentCounts]++;
    }
    totalEngagement += s.engagementScore;
  }

  const mostCommonEmotion =
    Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "neutral";

  return {
    totalSessions: total,
    avgEngagementScore: Math.round(totalEngagement / total),
    mostCommonEmotion,
    sentimentBreakdown: {
      positive: Math.round((sentimentCounts.positive / total) * 100),
      neutral: Math.round((sentimentCounts.neutral / total) * 100),
      negative: Math.round((sentimentCounts.negative / total) * 100),
    },
  };
}

export async function getEmotionTrendsOverTime(
  userId: string | null,
  days: number,
  employeeId?: string,
): Promise<TrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = {
    status: "COMPLETED",
    sessionDate: { gte: since },
    ...(employeeId ? { employeeId } : {}),
  };
  if (userId) where.userId = userId;

  const sessions = await db.analysisSession.findMany({
    where,
    select: {
      sessionDate: true,
      avgSentiments: true,
      engagementScore: true,
    },
    orderBy: { sessionDate: "asc" },
  });

  const byDate = new Map<
    string,
    { positive: number[]; neutral: number[]; negative: number[]; engagement: number[] }
  >();

  for (const s of sessions) {
    const key = s.sessionDate.toISOString().slice(0, 10);
    if (!byDate.has(key)) {
      byDate.set(key, {
        positive: [],
        neutral: [],
        negative: [],
        engagement: [],
      });
    }
    const entry = byDate.get(key)!;
    const scores = JSON.parse(s.avgSentiments) as Score[];
    for (const score of scores) {
      if (score.label === "positive") entry.positive.push(score.confidence);
      else if (score.label === "neutral") entry.neutral.push(score.confidence);
      else if (score.label === "negative") entry.negative.push(score.confidence);
    }
    entry.engagement.push(s.engagementScore);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const result: TrendPoint[] = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const v = byDate.get(key);
    result.push({
      date: key,
      positive: v ? parseFloat((avg(v.positive) * 100).toFixed(1)) : 0,
      neutral: v ? parseFloat((avg(v.neutral) * 100).toFixed(1)) : 0,
      negative: v ? parseFloat((avg(v.negative) * 100).toFixed(1)) : 0,
      avgEngagement: v ? Math.round(avg(v.engagement)) : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

export async function getEmotionHeatmap(
  userId: string | null,
  days: number,
): Promise<EmotionTrendRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = {
    status: "COMPLETED",
    sessionDate: { gte: since },
  };
  if (userId) where.userId = userId;

  const sessions = await db.analysisSession.findMany({
    where,
    select: { sessionDate: true, avgEmotions: true },
    orderBy: { sessionDate: "asc" },
  });

  const byDate = new Map<string, Record<string, number[]>>();

  for (const s of sessions) {
    const key = s.sessionDate.toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, {});
    const entry = byDate.get(key)!;
    const emotions = JSON.parse(s.avgEmotions) as Score[];
    for (const e of emotions) {
      if (!entry[e.label]) entry[e.label] = [];
      entry[e.label]!.push(e.confidence);
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const EMPTY_EMOTIONS: Record<string, number> = {
    anger: 0, disgust: 0, fear: 0, joy: 0, neutral: 0, sadness: 0, surprise: 0,
  };

  const result: EmotionTrendRow[] = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const emotionMap = byDate.get(key);
    result.push({
      date: key,
      emotions: emotionMap
        ? {
            ...EMPTY_EMOTIONS,
            ...Object.fromEntries(
              Object.entries(emotionMap).map(([label, vals]) => [
                label,
                parseFloat((avg(vals) * 100).toFixed(1)),
              ]),
            ),
          }
        : { ...EMPTY_EMOTIONS },
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

export async function updateSessionResult(
  sessionId: string,
  data: {
    avgEmotions: string;
    avgSentiments: string;
    topEmotion: string;
    topSentiment: string;
    summary: string;
    engagementScore: number;
    durationSecs: number | null;
    utterances: Array<{
      startTime: number;
      endTime: number;
      text: string;
      speaker: string | null;
      emotions: string;
      sentiments: string;
    }>;
  },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.analysisSession.update({
      where: { id: sessionId },
      data: {
        avgEmotions: data.avgEmotions,
        avgSentiments: data.avgSentiments,
        topEmotion: data.topEmotion,
        topSentiment: data.topSentiment,
        summary: data.summary,
        engagementScore: data.engagementScore,
        durationSecs: data.durationSecs,
        status: "COMPLETED",
        errorMessage: null,
      },
    });

    if (data.utterances.length > 0) {
      await tx.utterance.createMany({
        data: data.utterances.map((u) => ({ sessionId, ...u })),
      });
    }
  });
}

export async function updateSessionFailed(
  sessionId: string,
  errorMessage: string,
): Promise<void> {
  await db.analysisSession.update({
    where: { id: sessionId },
    data: { status: "FAILED", errorMessage },
  });
}

export async function getSessionStatus(
  sessionId: string,
  userId: string | null,
): Promise<{ status: string; errorMessage: string | null } | null> {
  const row = await db.analysisSession.findFirst({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    select: { status: true, errorMessage: true },
  });
  return row;
}

export async function deleteSession(
  sessionId: string,
  userId: string | null,
): Promise<void> {
  await db.analysisSession.delete({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
  });
}

export async function deleteSessionsBulk(
  sessionIds: string[],
  userId: string | null,
): Promise<void> {
  await db.analysisSession.deleteMany({
    where: userId
      ? { id: { in: sessionIds }, userId }
      : { id: { in: sessionIds } },
  });
}

export async function updateSessionEmployee(
  sessionId: string,
  userId: string | null,
  employeeId: string | null,
): Promise<void> {
  await db.analysisSession.update({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    data: { employeeId },
  });
}

export async function updateEmployeeSpeaker(
  sessionId: string,
  userId: string | null,
  employeeSpeakerId: string | null,
): Promise<void> {
  await db.analysisSession.update({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    data: { employeeSpeakerId },
  });
}

export async function updateSessionTitle(
  sessionId: string,
  userId: string | null,
  title: string,
): Promise<void> {
  await db.analysisSession.update({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    data: { title },
  });
}

export async function renameSpeaker(
  sessionId: string,
  userId: string | null,
  oldName: string,
  newName: string,
): Promise<void> {
  const session = await db.analysisSession.findFirst({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    select: { id: true },
  });
  if (!session) throw new Error("Session not found");

  await db.utterance.updateMany({
    where: { sessionId, speaker: oldName },
    data: { speaker: newName },
  });
}

export async function getSessionTypeBreakdown(userId: string | null) {
  const where: Record<string, unknown> = { status: "COMPLETED" };
  if (userId) where.userId = userId;

  const sessions = await db.analysisSession.findMany({
    where,
    select: { sessionType: true, avgEmotions: true, avgSentiments: true },
  });

  const byType = new Map<string, { emotions: Record<string, number[]>; sentiments: Record<string, number[]> }>();

  for (const s of sessions) {
    if (!byType.has(s.sessionType)) {
      byType.set(s.sessionType, { emotions: {}, sentiments: {} });
    }
    const entry = byType.get(s.sessionType)!;
    const emotions = JSON.parse(s.avgEmotions) as Score[];
    const sentiments = JSON.parse(s.avgSentiments) as Score[];
    for (const e of emotions) {
      if (!entry.emotions[e.label]) entry.emotions[e.label] = [];
      entry.emotions[e.label]!.push(e.confidence);
    }
    for (const sv of sentiments) {
      if (!entry.sentiments[sv.label]) entry.sentiments[sv.label] = [];
      entry.sentiments[sv.label]!.push(sv.confidence);
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  return Array.from(byType.entries()).map(([sessionType, v]) => ({
    sessionType,
    emotions: Object.fromEntries(
      Object.entries(v.emotions).map(([label, vals]) => [
        label,
        parseFloat((avg(vals) * 100).toFixed(1)),
      ]),
    ),
    sentiments: Object.fromEntries(
      Object.entries(v.sentiments).map(([label, vals]) => [
        label,
        parseFloat((avg(vals) * 100).toFixed(1)),
      ]),
    ),
  }));
}
