import { db } from "~/server/db";
import {
  computeEmployeeSessionMetrics,
  countTopEmotions,
  countTopSentiments,
  expressiveFromCounts,
  mergeEmotionCounts,
  sentimentFromCounts,
  topEmotionFromCounts,
  topLabel,
  type EmotionCounts,
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
  // Main-sentiment tally of the lines (label -> count). Every sentiment %
  // is built from it with sentimentFromCounts.
  sentimentCounts: EmotionCounts;
  // Main-emotion tally of the lines (neutral included). Reports pool these
  // across sessions with mergeEmotionCounts, as the dashboard does.
  emotionCounts: EmotionCounts;
  summary: string;
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: {
    id: string;
    name: string;
    department: string | null;
    status: string;
  } | null;
  // Meeting participants' names, in the order they were added. Meetings use
  // these instead of `employee`.
  attendeeNames: string[];
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
  promotedEmployeeId: string | null;
  rejectedAt: Date | null;
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
  sentimentCounts: string;
  summary: string;
  durationSecs: number | null;
  interviewerName: string | null;
  createdAt: Date;
  employeeId: string | null;
  employeeSpeakerId: string | null;
  employee: {
    id: string;
    name: string;
    department: string | null;
    status: string;
  } | null;
  user: { id: string; name: string | null } | null;
  participants: { employee: { name: string } }[];
  status: string;
  errorMessage: string | null;
  emotionCounts: string;
  utteranceCount: number;
}): ParsedSession {
  const emotionCounts = JSON.parse(raw.emotionCounts) as EmotionCounts;
  const expressive = expressiveFromCounts(emotionCounts, raw.utteranceCount);
  return {
    id: raw.id,
    title: raw.title,
    sessionType: raw.sessionType,
    sessionDate: raw.sessionDate,
    topEmotion: raw.topEmotion,
    topSentiment: raw.topSentiment,
    avgEmotions: JSON.parse(raw.avgEmotions) as Score[],
    sentimentCounts: JSON.parse(raw.sentimentCounts) as EmotionCounts,
    emotionCounts,
    summary: raw.summary,
    durationSecs: raw.durationSecs,
    interviewerName: raw.interviewerName,
    createdAt: raw.createdAt,
    employeeId: raw.employeeId,
    employeeSpeakerId: raw.employeeSpeakerId,
    employee: raw.employee,
    attendeeNames: raw.participants.map((p) => p.employee.name),
    handledBy: raw.user,
    status: raw.status,
    errorMessage: raw.errorMessage,
    utteranceCount: raw.utteranceCount,
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
  sentimentCounts: true,
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
  participants: {
    select: {
      employeeId: true,
      speakerLabel: true,
      employee: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  // Stored tally, not the utterances: a list never loads utterance rows.
  emotionCounts: true,
  utteranceCount: true,
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
      utterances: {
        select: { emotions: true, sentiments: true, speaker: true },
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
    const speakerLabel =
      row.participants.find((p) => p.employeeId === employeeId)?.speakerLabel ??
      null;
    if (speakerLabel === null) continue;
    const slice = row.utterances
      .filter((u) => u.speaker === speakerLabel)
      .map((u) => ({
        emotions: JSON.parse(u.emotions) as Score[],
        sentiments: JSON.parse(u.sentiments) as Score[],
      }));
    const metrics = computeEmployeeSessionMetrics(slice);
    // Only this employee's own lines count toward their sentiment.
    const sentimentCounts = countTopSentiments(slice);
    result.push({
      ...parseSession(row),
      avgEmotions: metrics.avgEmotions,
      sentimentCounts,
      emotionCounts: countTopEmotions(slice),
      topEmotion: metrics.topEmotion,
      topSentiment: topLabel(sentimentCounts),
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
          promotedEmployeeId: true,
          rejectedAt: true,
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
  // Completed sessions behind these figures (the dashboard numbers row).
  sessionCount: number;
}> {
  const where: Record<string, unknown> = { status: "COMPLETED" };
  if (userId) where.userId = userId;
  if (sessionType) where.sessionType = sessionType;

  // One row per session: its stored tallies replace loading every utterance
  // of every completed session.
  const rows = await db.analysisSession.findMany({
    where,
    select: {
      sentimentCounts: true,
      emotionCounts: true,
      utteranceCount: true,
    },
  });

  const counts = mergeEmotionCounts(
    rows.map((s) => JSON.parse(s.emotionCounts) as EmotionCounts),
  );
  const totalUtterances = rows.reduce((sum, s) => sum + s.utteranceCount, 0);

  // Share of all lines (every session's lines pooled), like the emotions.
  const sentimentCounts = mergeEmotionCounts(
    rows.map((s) => JSON.parse(s.sentimentCounts) as EmotionCounts),
  );

  return {
    expressive: expressiveFromCounts(counts, totalUtterances),
    allEmotions: topEmotionFromCounts(counts, totalUtterances),
    sentiment: sentimentFromCounts(sentimentCounts),
    sessionCount: rows.length,
  };
}

export type SessionTallyRow = {
  sessionDate: Date;
  emotionCounts: EmotionCounts;
  sentimentCounts: EmotionCounts;
  utteranceCount: number;
};

// Stored per-line tallies of every completed session dated on or after
// `since` (optionally one session type), any owner: callers gate by role
// (Director quarterly report, Manager month comparison).
export async function getCompletedTalliesSince(
  since: Date,
  sessionType?: string,
): Promise<SessionTallyRow[]> {
  const rows = await db.analysisSession.findMany({
    where: {
      status: "COMPLETED",
      sessionDate: { gte: since },
      ...(sessionType ? { sessionType } : {}),
    },
    select: {
      sessionDate: true,
      emotionCounts: true,
      sentimentCounts: true,
      utteranceCount: true,
    },
  });
  return rows.map((r) => ({
    sessionDate: r.sessionDate,
    emotionCounts: JSON.parse(r.emotionCounts) as EmotionCounts,
    sentimentCounts: JSON.parse(r.sentimentCounts) as EmotionCounts,
    utteranceCount: r.utteranceCount,
  }));
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
      else if (score.label === "negative")
        entry.negative.push(score.confidence);
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
    anger: 0,
    disgust: 0,
    fear: 0,
    joy: 0,
    neutral: 0,
    sadness: 0,
    surprise: 0,
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

// Completed sessions whose stored per-line figures are missing: saved by a
// build from before emotionCounts (utteranceCount 0) or sentimentCounts
// ("{}") existed. Utterances come without orderBy, the same first-seen order
// as every other tally.
export async function findSessionsMissingTallies(): Promise<
  {
    id: string;
    utterances: {
      start_time: number;
      emotions: Score[];
      sentiments: Score[];
    }[];
  }[]
> {
  const rows = await db.analysisSession.findMany({
    where: {
      status: "COMPLETED",
      utterances: { some: {} },
      OR: [{ utteranceCount: 0 }, { sentimentCounts: "{}" }],
    },
    select: {
      id: true,
      utterances: {
        select: { startTime: true, emotions: true, sentiments: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    utterances: r.utterances.map((u) => ({
      start_time: u.startTime,
      emotions: JSON.parse(u.emotions) as Score[],
      sentiments: JSON.parse(u.sentiments) as Score[],
    })),
  }));
}

export async function saveSessionTallies(
  rows: {
    id: string;
    emotionCounts: string;
    sentimentCounts: string;
    utteranceCount: number;
    topSentiment: string;
    summary: string;
  }[],
): Promise<void> {
  await db.$transaction(
    rows.map(({ id, ...data }) =>
      db.analysisSession.update({ where: { id }, data }),
    ),
  );
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
    // From computeSessionTallies() over these same utterances.
    emotionCounts: string;
    sentimentCounts: string;
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
        emotionCounts: data.emotionCounts,
        sentimentCounts: data.sentimentCounts,
        utteranceCount: data.utterances.length,
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
export async function markSessionProcessing(sessionId: string): Promise<void> {
  await db.analysisSession.update({
    where: { id: sessionId },
    data: { status: "PROCESSING", errorMessage: null },
  });
}

// The browser reports its own failed upload. Only an UPLOADING row owned by
// the uploader flips, so a late report never overwrites a real result.
export async function failUploadingSession(
  sessionId: string,
  userId: string,
  errorMessage: string,
): Promise<void> {
  await db.analysisSession.updateMany({
    where: { id: sessionId, userId, status: "UPLOADING" },
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

const UNFINISHED_STATUSES = ["UPLOADING", "PROCESSING"];

// Cancel = delete, but only while the analysis is unfinished, so a cancel
// that races the result callback never wipes a completed session. Returns the
// R2 key to purge, or null when nothing was cancelled.
export async function deleteUnfinishedSession(
  sessionId: string,
  userId: string | null,
): Promise<{ videoKey: string } | null> {
  const where = {
    ...(userId ? { id: sessionId, userId } : { id: sessionId }),
    status: { in: UNFINISHED_STATUSES },
  };
  const row = await db.analysisSession.findFirst({
    where,
    select: { videoKey: true },
  });
  if (!row) return null;
  const { count } = await db.analysisSession.deleteMany({ where });
  return count > 0 ? row : null;
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

// Marks this session's onboarding candidate as rejected. The WHERE guards make
// the precondition atomic: a candidate that is already promoted or already
// rejected is left untouched (a stale tab cannot reset the retention clock).
// Returns the number of rows updated so the caller can detect a no-op.
export async function setCandidateRejected(
  sessionId: string,
  userId: string | null,
  rejectedAt: Date,
): Promise<number> {
  const res = await db.onboardingCandidate.updateMany({
    where: {
      sessionId,
      promotedEmployeeId: null,
      rejectedAt: null,
      ...(userId ? { session: { userId } } : {}),
    },
    data: { rejectedAt },
  });
  return res.count;
}

// Clears the rejection so HR can undo a mistake before the deletion date.
export async function clearCandidateRejection(
  sessionId: string,
  userId: string | null,
): Promise<void> {
  await db.onboardingCandidate.updateMany({
    where: {
      sessionId,
      ...(userId ? { session: { userId } } : {}),
    },
    data: { rejectedAt: null },
  });
}

// Deletes every interview session whose candidate was rejected before the
// cutoff and never promoted. Deleting the AnalysisSession cascades to its
// utterances, participants, and the candidate. Returns the number deleted.
export async function deleteExpiredRejectedCandidateSessions(
  cutoff: Date,
): Promise<number> {
  const res = await db.analysisSession.deleteMany({
    where: {
      sessionType: "interview",
      onboardingCandidate: {
        is: {
          rejectedAt: { lt: cutoff },
          promotedEmployeeId: null,
        },
      },
    },
  });
  return res.count;
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

  const byType = new Map<
    string,
    { emotions: Record<string, number[]>; sentiments: Record<string, number[]> }
  >();

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
