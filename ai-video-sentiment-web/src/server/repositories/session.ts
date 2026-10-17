import { db } from "~/server/db";
import {
  computeEmployeeSessionMetrics,
  computeExpressive,
  computeTopEmotion,
  getSentimentBreakdown,
  type ExpressiveBreakdown,
  type Score,
  type SentimentBreakdown,
  type TopEmotionBreakdown,
} from "~/types/analysis";

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
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: { id: string; name: string; department: string | null; status: string } | null;
  handledBy: { id: string; name: string | null } | null;
  status: string;
  errorMessage: string | null;
  utteranceCount?: number;
  expressivenessPct: number;
  topExpressiveEmotion: string;
  expressiveEmotions: Score[];
}

export interface OnboardingCandidateRow {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  promotedEmployeeId: string | null;
}

export interface SessionParticipantRow {
  employeeId: string;
  employeeName: string;
  speakerLabel: string | null;
}

export interface ParsedSessionWithUtterances extends ParsedSession {
  utterances: ParsedUtterance[];
  onboardingCandidate: OnboardingCandidateRow | null;
  participants: SessionParticipantRow[];
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
}

export interface EmotionTrendRow {
  date: string;
  emotions: Record<string, number>;
}

// Trend/heatmap buckets must agree with the client's calendar day so a
// session uploaded "today" lands on today's row. Server may run in UTC;
// client is Philippines-based (Arup HR). Format in Asia/Manila so both
// the session key and the cursor key share the same TZ.
const DASHBOARD_TZ = "Asia/Manila";
const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DASHBOARD_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function ymdInDashboardTZ(d: Date): string {
  return ymdFormatter.format(d);
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
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: { id: string; name: string; department: string | null; status: string } | null;
  user: { id: string; name: string | null } | null;
  status: string;
  errorMessage: string | null;
  utterances: { emotions: string }[];
}): ParsedSession {
  const utteranceEmotions = raw.utterances.map((u) => ({
    emotions: JSON.parse(u.emotions) as Score[],
  }));
  const expressive = computeExpressive(utteranceEmotions);
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
    durationSecs: raw.durationSecs,
    interviewerName: raw.interviewerName,
    createdAt: raw.createdAt,
    employeeId: raw.employeeId,
    employeeSpeakerId: raw.employeeSpeakerId,
    employee: raw.employee,
    handledBy: raw.user,
    status: raw.status,
    errorMessage: raw.errorMessage,
    utteranceCount: raw.utterances.length,
    expressivenessPct: expressive.expressivenessPct,
    topExpressiveEmotion: expressive.topExpressiveEmotion,
    expressiveEmotions: expressive.expressiveEmotions,
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
  durationSecs: true,
  interviewerName: true,
  createdAt: true,
  employeeId: true,
  employeeSpeakerId: true,
  status: true,
  errorMessage: true,
  employee: {
    select: { id: true, name: true, department: true, status: true },
  },
  user: {
    select: { id: true, name: true },
  },
  utterances: { select: { emotions: true } },
} as const;

export async function getSessionsByUser(
  userId: string | null,
  filters: SessionFilters = {},
): Promise<ParsedSession[]> {
  const baseWhere: Record<string, unknown> = {};
  if (userId) baseWhere.userId = userId;
  if (filters.sessionType) baseWhere.sessionType = filters.sessionType;
  if (filters.from ?? filters.to) {
    baseWhere.sessionDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  if (!filters.employeeId) {
    const rows = await db.analysisSession.findMany({
      where: baseWhere,
      select: SESSION_SELECT,
      orderBy: { sessionDate: "desc" },
    });
    return rows.map(parseSession);
  }

  // Employee-scoped: single-employee sessions (employeeId match) OR
  // meeting sessions where the employee is a declared participant. For
  // meetings, metrics are recomputed from only that employee's mapped
  // speaker's utterances; an unbound participant has no attributable
  // data and the meeting is omitted until bound.
  const employeeId = filters.employeeId;
  const rows = await db.analysisSession.findMany({
    where: {
      ...baseWhere,
      OR: [{ employeeId }, { participants: { some: { employeeId } } }],
    },
    select: {
      ...SESSION_SELECT,
      utterances: { select: { emotions: true, sentiments: true, speaker: true } },
      participants: {
        where: { employeeId },
        select: { speakerLabel: true },
      },
    },
    orderBy: { sessionDate: "desc" },
  });

  const result: ParsedSession[] = [];
  for (const row of rows) {
    if (row.sessionType !== "meeting") {
      result.push(parseSession(row));
      continue;
    }
    const speakerLabel = row.participants[0]?.speakerLabel ?? null;
    if (speakerLabel === null) continue;
    const slice = row.utterances
      .filter((u) => u.speaker === speakerLabel)
      .map((u) => ({
        emotions: JSON.parse(u.emotions) as Score[],
        sentiments: JSON.parse(u.sentiments) as Score[],
      }));
    const metrics = computeEmployeeSessionMetrics(slice);
    result.push({
      ...parseSession(row),
      avgEmotions: metrics.avgEmotions,
      avgSentiments: metrics.avgSentiments,
      topEmotion: metrics.topEmotion,
      topSentiment: metrics.topSentiment,
      expressivenessPct: metrics.expressivenessPct,
      topExpressiveEmotion: metrics.topExpressiveEmotion,
      expressiveEmotions: metrics.expressiveEmotions,
      utteranceCount: slice.length,
    });
  }
  return result;
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
        select: {
          id: true,
          name: true,
          position: true,
          email: true,
          phone: true,
          age: true,
          gender: true,
          promotedEmployeeId: true,
        },
      },
      participants: {
        select: {
          employeeId: true,
          speakerLabel: true,
          employee: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
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

  const participants: SessionParticipantRow[] = row.participants.map((p) => ({
    employeeId: p.employeeId,
    employeeName: p.employee.name,
    speakerLabel: p.speakerLabel,
  }));

  return {
    ...base,
    utterances,
    onboardingCandidate: row.onboardingCandidate ?? null,
    participants,
  };
}

export async function getAggregateEmotionMetrics(
  userId: string | null,
  sessionType?: string,
): Promise<{
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  sentiment: SentimentBreakdown;
}> {
  const where: Record<string, unknown> = { status: "COMPLETED" };
  if (userId) where.userId = userId;
  if (sessionType) where.sessionType = sessionType;

  const [rows, sentimentRows] = await Promise.all([
    db.utterance.findMany({
      where: { session: where },
      select: { emotions: true },
    }),
    db.analysisSession.findMany({
      where,
      select: { avgSentiments: true },
    }),
  ]);

  const utterances = rows.map((u) => ({
    emotions: JSON.parse(u.emotions) as Score[],
  }));

  // Average each sentiment label's confidence across completed sessions,
  // then normalize via the shared pure breakdown helper.
  const sums: Record<string, number> = {};
  for (const s of sentimentRows) {
    for (const score of JSON.parse(s.avgSentiments) as Score[]) {
      sums[score.label] = (sums[score.label] ?? 0) + score.confidence;
    }
  }
  const n = sentimentRows.length;
  const avgSentiment: Score[] = Object.entries(sums).map(([label, sum]) => ({
    label,
    confidence: n > 0 ? sum / n : 0,
  }));

  return {
    expressive: computeExpressive(utterances),
    allEmotions: computeTopEmotion(utterances),
    sentiment: getSentimentBreakdown(avgSentiment),
  };
}

export async function getEmotionTrendsOverTime(
  userId: string | null,
  days: number,
  employeeId?: string,
): Promise<TrendPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const baseWhere: Record<string, unknown> = {
    status: "COMPLETED",
    sessionDate: { gte: since },
  };
  if (userId) baseWhere.userId = userId;

  interface TrendInput {
    sessionDate: Date;
    avgSentiments: Score[];
  }
  let points: TrendInput[];

  if (!employeeId) {
    const sessions = await db.analysisSession.findMany({
      where: baseWhere,
      select: { sessionDate: true, avgSentiments: true },
      orderBy: { sessionDate: "asc" },
    });
    points = sessions.map((s) => ({
      sessionDate: s.sessionDate,
      avgSentiments: JSON.parse(s.avgSentiments) as Score[],
    }));
  } else {
    // Same employee-scoping as getSessionsByUser: meetings contribute
    // only the employee's mapped-speaker slice; unbound participant
    // meetings are omitted.
    const sessions = await db.analysisSession.findMany({
      where: {
        ...baseWhere,
        OR: [{ employeeId }, { participants: { some: { employeeId } } }],
      },
      select: {
        sessionDate: true,
        avgSentiments: true,
        sessionType: true,
        utterances: {
          select: { emotions: true, sentiments: true, speaker: true },
        },
        participants: { where: { employeeId }, select: { speakerLabel: true } },
      },
      orderBy: { sessionDate: "asc" },
    });
    points = [];
    for (const s of sessions) {
      if (s.sessionType !== "meeting") {
        points.push({
          sessionDate: s.sessionDate,
          avgSentiments: JSON.parse(s.avgSentiments) as Score[],
        });
        continue;
      }
      const speakerLabel = s.participants[0]?.speakerLabel ?? null;
      if (speakerLabel === null) continue;
      const slice = s.utterances
        .filter((u) => u.speaker === speakerLabel)
        .map((u) => ({
          emotions: JSON.parse(u.emotions) as Score[],
          sentiments: JSON.parse(u.sentiments) as Score[],
        }));
      const metrics = computeEmployeeSessionMetrics(slice);
      points.push({
        sessionDate: s.sessionDate,
        avgSentiments: metrics.avgSentiments,
      });
    }
  }

  const byDate = new Map<
    string,
    { positive: number[]; neutral: number[]; negative: number[] }
  >();

  for (const s of points) {
    const key = ymdInDashboardTZ(s.sessionDate);
    if (!byDate.has(key)) {
      byDate.set(key, {
        positive: [],
        neutral: [],
        negative: [],
      });
    }
    const entry = byDate.get(key)!;
    for (const score of s.avgSentiments) {
      if (score.label === "positive") entry.positive.push(score.confidence);
      else if (score.label === "neutral") entry.neutral.push(score.confidence);
      else if (score.label === "negative") entry.negative.push(score.confidence);
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const result: TrendPoint[] = [];
  const cursor = new Date(since);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor <= today) {
    const key = ymdInDashboardTZ(cursor);
    const v = byDate.get(key);
    result.push({
      date: key,
      positive: v ? parseFloat((avg(v.positive) * 100).toFixed(1)) : 0,
      neutral: v ? parseFloat((avg(v.neutral) * 100).toFixed(1)) : 0,
      negative: v ? parseFloat((avg(v.negative) * 100).toFixed(1)) : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

export async function getEmotionHeatmap(
  userId: string | null,
  days: number,
  sessionType?: string,
): Promise<EmotionTrendRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = {
    status: "COMPLETED",
    sessionDate: { gte: since },
  };
  if (userId) where.userId = userId;
  if (sessionType) where.sessionType = sessionType;

  const sessions = await db.analysisSession.findMany({
    where,
    select: { sessionDate: true, avgEmotions: true },
    orderBy: { sessionDate: "asc" },
  });

  const byDate = new Map<string, Record<string, number[]>>();

  for (const s of sessions) {
    const key = ymdInDashboardTZ(s.sessionDate);
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
    const key = ymdInDashboardTZ(cursor);
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

// Upload state machine: createUpload writes UPLOADING; this flips to
// PROCESSING only after the object is confirmed in storage, so a client
// that dies mid-upload leaves an UPLOADING (abandonable) row, never a
// PROCESSING spinner that never resolves.
export async function markSessionProcessing(
  sessionId: string,
): Promise<void> {
  await db.analysisSession.update({
    where: { id: sessionId },
    data: { status: "PROCESSING", errorMessage: null },
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

// Records that this session's onboarding candidate has been promoted to an
// Employee. Ownership is enforced via the parent session relation so a user
// cannot mark a candidate they do not own.
export async function markCandidatePromoted(
  sessionId: string,
  userId: string | null,
  employeeId: string,
): Promise<void> {
  await db.onboardingCandidate.updateMany({
    where: {
      sessionId,
      ...(userId ? { session: { userId } } : {}),
    },
    data: { promotedEmployeeId: employeeId },
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

// Binds one declared meeting participant to a detected speaker label (or
// null to unbind). speakerLabel is unique per session, so a label is
// first released from any other participant holding it.
export async function setParticipantSpeaker(
  sessionId: string,
  userId: string | null,
  employeeId: string,
  speakerLabel: string | null,
): Promise<void> {
  const sessionRow = await db.analysisSession.findFirst({
    where: userId ? { id: sessionId, userId } : { id: sessionId },
    select: { id: true },
  });
  if (!sessionRow) throw new Error("Session not found");

  await db.$transaction(async (tx) => {
    if (speakerLabel !== null) {
      await tx.sessionParticipant.updateMany({
        where: { sessionId, speakerLabel, NOT: { employeeId } },
        data: { speakerLabel: null },
      });
    }
    await tx.sessionParticipant.update({
      where: { sessionId_employeeId: { sessionId, employeeId } },
      data: { speakerLabel },
    });
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

  // speakerLabel is the join key for meeting per-employee analytics, so a
  // speaker rename must move the participant binding too or the meeting
  // silently drops out of that employee's history.
  await db.$transaction([
    db.utterance.updateMany({
      where: { sessionId, speaker: oldName },
      data: { speaker: newName },
    }),
    db.sessionParticipant.updateMany({
      where: { sessionId, speakerLabel: oldName },
      data: { speakerLabel: newName },
    }),
  ]);
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
