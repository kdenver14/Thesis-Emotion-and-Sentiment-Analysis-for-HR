export const EMOTION_LABELS = [
  "anger",
  "disgust",
  "fear",
  "joy",
  "neutral",
  "sadness",
  "surprise",
] as const;

export const SENTIMENT_LABELS = ["negative", "neutral", "positive"] as const;

export const SESSION_TYPES = [
  "interview",
  "performance_review",
  "onboarding",
  "training",
  "meeting",
] as const;

export const SESSION_TYPE_LABELS: Record<string, string> = {
  interview: "Interview",
  performance_review: "Performance Review",
  onboarding: "Onboarding",
  exit_interview: "Exit Interview",
  training: "Training",
  meeting: "Meeting",
  general: "General",
};

export type EmotionLabel = (typeof EMOTION_LABELS)[number];
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];
export type SessionType = (typeof SESSION_TYPES)[number];

export interface Score {
  label: string;
  confidence: number;
}

export interface UtteranceData {
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
  emotions: Score[];
  sentiments: Score[];
}

export interface InferenceResult {
  utterances: UtteranceData[];
}

export interface OnboardingCandidateInput {
  name: string;
  position?: string;
  email?: string;
  phone?: string;
}

export interface SessionMetadataInput {
  title: string;
  sessionType: SessionType;
  employeeId?: string;
  sessionDate?: string;
  interviewerName?: string;
  onboardingCandidate?: OnboardingCandidateInput;
  // Meeting type only: employee ids declared at upload, bound to
  // detected speakers post-inference.
  participantEmployeeIds?: string[];
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface ExpressiveBreakdown {
  expressivenessPct: number;
  topExpressiveEmotion: string;
  expressiveEmotions: Score[];
}

export interface TopEmotionBreakdown {
  topEmotion: string;
  topEmotionPct: number;
  total: number;
  // Share of utterances by their dominant emotion (incl. neutral), sorted desc.
  breakdown: Score[];
}

// Each utterance's dominant (argmax) emotion, tallied in first-seen order.
// Sessions store this tally (AnalysisSession.emotionCounts) so lists and the
// dashboard never re-read every utterance. The key order breaks ties in the
// breakdowns below, so it must be kept (JSON keeps insertion order for
// non-numeric keys).
export type EmotionCounts = Record<string, number>;

export function countTopEmotions(
  utterances: { emotions: Score[] }[],
): EmotionCounts {
  const counts: EmotionCounts = {};
  for (const u of utterances) {
    if (u.emotions.length === 0) continue;
    let top = u.emotions[0]!;
    for (const e of u.emotions) {
      if (e.confidence > top.confidence) top = e;
    }
    counts[top.label] = (counts[top.label] ?? 0) + 1;
  }
  return counts;
}

// Sums tallies in the order given; a label first seen earlier stays ahead
// on ties.
export function mergeEmotionCounts(tallies: EmotionCounts[]): EmotionCounts {
  const merged: EmotionCounts = {};
  for (const tally of tallies) {
    for (const [label, n] of Object.entries(tally)) {
      merged[label] = (merged[label] ?? 0) + n;
    }
  }
  return merged;
}

// `total` is the utterance count, including any without emotion scores.
export function topEmotionFromCounts(
  counts: EmotionCounts,
  total: number,
): TopEmotionBreakdown {
  if (total === 0) {
    return { topEmotion: "neutral", topEmotionPct: 0, total: 0, breakdown: [] };
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const first = sorted[0];
  const breakdown: Score[] = sorted.map(([label, c]) => ({
    label,
    confidence: c / total,
  }));
  return {
    topEmotion: first?.[0] ?? "neutral",
    topEmotionPct: first ? Math.round((first[1] / total) * 100) : 0,
    total,
    breakdown,
  };
}

export function expressiveFromCounts(
  counts: EmotionCounts,
  total: number,
): ExpressiveBreakdown {
  if (total === 0) {
    return {
      expressivenessPct: 0,
      topExpressiveEmotion: "neutral",
      expressiveEmotions: [],
    };
  }
  const expressive = Object.entries(counts).filter(
    ([label]) => label !== "neutral",
  );
  const nonNeutral = expressive.reduce((sum, [, c]) => sum + c, 0);
  const expressiveEmotions: Score[] = expressive
    .map(([label, c]) => ({
      label,
      confidence: nonNeutral > 0 ? c / nonNeutral : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence);
  return {
    expressivenessPct: Math.round((nonNeutral / total) * 100),
    topExpressiveEmotion: expressiveEmotions[0]?.label ?? "neutral",
    expressiveEmotions,
  };
}

export function computeTopEmotion(
  utterances: { emotions: Score[] }[],
): TopEmotionBreakdown {
  return topEmotionFromCounts(countTopEmotions(utterances), utterances.length);
}

export function computeExpressive(
  utterances: { emotions: Score[] }[],
): ExpressiveBreakdown {
  return expressiveFromCounts(countTopEmotions(utterances), utterances.length);
}

type ScoredUtterance = { emotions: Score[]; sentiments: Score[] };

export function computeAverages(utterances: ScoredUtterance[]): {
  avgEmotions: Score[];
  avgSentiments: Score[];
  topEmotion: string;
  topSentiment: string;
} {
  const emotionMap: Record<string, number[]> = {};
  const sentimentMap: Record<string, number[]> = {};

  for (const u of utterances) {
    for (const e of u.emotions) {
      if (!emotionMap[e.label]) emotionMap[e.label] = [];
      emotionMap[e.label]!.push(e.confidence);
    }
    for (const s of u.sentiments) {
      if (!sentimentMap[s.label]) sentimentMap[s.label] = [];
      sentimentMap[s.label]!.push(s.confidence);
    }
  }

  // Average over EVERY utterance: a label missing from an utterance's stored
  // top 3 counts as 0. Dividing only by the utterances that listed it made
  // rarely-seen emotions look as big as common ones.
  const total = utterances.length;
  const avg = (arr: number[]) =>
    total === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / total;

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

export interface EmployeeSessionMetrics {
  avgEmotions: Score[];
  avgSentiments: Score[];
  topEmotion: string;
  topSentiment: string;
  expressivenessPct: number;
  topExpressiveEmotion: string;
  expressiveEmotions: Score[];
}

// Recomputes the ParsedSession numeric subset from an arbitrary utterance
// slice (a single meeting participant's mapped-speaker utterances).
export function computeEmployeeSessionMetrics(
  utterances: ScoredUtterance[],
): EmployeeSessionMetrics {
  const { avgEmotions, avgSentiments, topEmotion, topSentiment } =
    computeAverages(utterances);
  const expressive = computeExpressive(utterances);
  return {
    avgEmotions,
    avgSentiments,
    topEmotion,
    topSentiment,
    expressivenessPct: expressive.expressivenessPct,
    topExpressiveEmotion: expressive.topExpressiveEmotion,
    expressiveEmotions: expressive.expressiveEmotions,
  };
}

// Hamilton largest-remainder: given shares that are intended to sum to a
// known total (default 100), returns integers that sum to exactly that total.
// Rounding each share independently can drift by +/- 1 per bucket; this keeps
// the sum stable for display (e.g. percentage bars that must add to 100).
export function distributePercents(
  shares: number[],
  total = 100,
): number[] {
  if (shares.length === 0) return [];
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum === 0) return shares.map(() => 0);
  const scaled = shares.map((s) => (s / sum) * total);
  const floors = scaled.map((v) => Math.floor(v));
  const used = floors.reduce((a, b) => a + b, 0);
  let shortfall = total - used;
  const order = scaled
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (shortfall <= 0) break;
    floors[i]! += 1;
    shortfall -= 1;
  }
  return floors;
}

// Shares -> integer percent slices for a donut and its legend: largest first,
// summing to exactly 100, zero slices dropped.
// Mean of each label's share across several breakdowns, each weighted
// equally (one per session); a label missing from a breakdown counts as 0.
export function averageShares(breakdowns: Score[][]): Score[] {
  if (breakdowns.length === 0) return [];
  const sums: Record<string, number> = {};
  for (const scores of breakdowns) {
    for (const s of scores) sums[s.label] = (sums[s.label] ?? 0) + s.confidence;
  }
  return Object.entries(sums).map(([label, sum]) => ({
    label,
    confidence: sum / breakdowns.length,
  }));
}

export function toPercentSlices(
  scores: Score[],
): { label: string; value: number }[] {
  const sorted = [...scores].sort((a, b) => b.confidence - a.confidence);
  const pcts = distributePercents(sorted.map((s) => s.confidence));
  return sorted
    .map((s, i) => ({ label: s.label, value: pcts[i] ?? 0 }))
    .filter((s) => s.value > 0);
}

export function getSentimentBreakdown(scores: Score[]): SentimentBreakdown {
  let pos = 0;
  let neu = 0;
  let neg = 0;
  for (const s of scores) {
    if (s.label === "positive") pos = s.confidence;
    else if (s.label === "neutral") neu = s.confidence;
    else if (s.label === "negative") neg = s.confidence;
  }
  if (pos + neu + neg === 0) return { positive: 0, neutral: 0, negative: 0 };
  const [p, n, g] = distributePercents([pos, neu, neg]);
  return { positive: p!, neutral: n!, negative: g! };
}
