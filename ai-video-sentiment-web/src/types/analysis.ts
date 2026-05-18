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
  age?: number;
  gender?: string;
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

export function computeTopEmotion(
  utterances: { emotions: Score[] }[],
): TopEmotionBreakdown {
  if (utterances.length === 0) {
    return { topEmotion: "neutral", topEmotionPct: 0, total: 0, breakdown: [] };
  }
  const counts: Record<string, number> = {};
  for (const u of utterances) {
    if (u.emotions.length === 0) continue;
    let top = u.emotions[0]!;
    for (const e of u.emotions) {
      if (e.confidence > top.confidence) top = e;
    }
    counts[top.label] = (counts[top.label] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const first = sorted[0];
  const breakdown: Score[] = sorted.map(([label, c]) => ({
    label,
    confidence: c / utterances.length,
  }));
  return {
    topEmotion: first?.[0] ?? "neutral",
    topEmotionPct: first ? Math.round((first[1] / utterances.length) * 100) : 0,
    total: utterances.length,
    breakdown,
  };
}

export function computeExpressive(
  utterances: { emotions: Score[] }[],
): ExpressiveBreakdown {
  if (utterances.length === 0) {
    return {
      expressivenessPct: 0,
      topExpressiveEmotion: "neutral",
      expressiveEmotions: [],
    };
  }
  const counts: Record<string, number> = {};
  let nonNeutral = 0;
  for (const u of utterances) {
    if (u.emotions.length === 0) continue;
    let top = u.emotions[0]!;
    for (const e of u.emotions) {
      if (e.confidence > top.confidence) top = e;
    }
    if (top.label !== "neutral") {
      nonNeutral++;
      counts[top.label] = (counts[top.label] ?? 0) + 1;
    }
  }
  const expressivenessPct = Math.round((nonNeutral / utterances.length) * 100);
  const expressiveEmotions: Score[] = Object.entries(counts)
    .map(([label, c]) => ({
      label,
      confidence: nonNeutral > 0 ? c / nonNeutral : 0,
    }))
    .sort((a, b) => b.confidence - a.confidence);
  return {
    expressivenessPct,
    topExpressiveEmotion: expressiveEmotions[0]?.label ?? "neutral",
    expressiveEmotions,
  };
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

const ENGAGEMENT_BASELINE = 60;
const DISENGAGEMENT_NEUTRAL_RATIO = 0.85;
const DISENGAGEMENT_VARIETY = 0.4;

// Single source of truth for the engagement formula. generateSummary
// delegates here so per-session and per-employee (meeting) scores stay
// identical. Counting loop intentionally mirrors generateSummary exactly
// (incl. its `else → negative` and undefined-in-variety-set behavior) so
// existing scores do not shift.
export function computeEngagementScore(
  utterances: ScoredUtterance[],
): number {
  const total = utterances.length;
  if (total === 0) return 0;

  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;
  for (const u of utterances) {
    const topSentiment = [...u.sentiments].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    if (topSentiment) {
      if (topSentiment.label === "positive") positiveCount++;
      else if (topSentiment.label === "neutral") neutralCount++;
      else negativeCount++;
    }
  }

  const positiveRatio = positiveCount / total;
  const neutralRatio = neutralCount / total;
  const negativeRatio = negativeCount / total;

  const uniqueEmotions = new Set(
    utterances.map(
      (u) =>
        [...u.emotions].sort((a, b) => b.confidence - a.confidence)[0]?.label,
    ),
  );
  const emotionVariety = Math.min(uniqueEmotions.size / 5, 1);
  const hasDisengagement =
    neutralRatio > DISENGAGEMENT_NEUTRAL_RATIO &&
    emotionVariety < DISENGAGEMENT_VARIETY;

  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        ENGAGEMENT_BASELINE +
          positiveRatio * 25 +
          emotionVariety * 15 -
          negativeRatio * 40 -
          (hasDisengagement ? 20 : 0),
      ),
    ),
  );
}

export interface EmployeeSessionMetrics {
  avgEmotions: Score[];
  avgSentiments: Score[];
  topEmotion: string;
  topSentiment: string;
  engagementScore: number;
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
    engagementScore: computeEngagementScore(utterances),
    expressivenessPct: expressive.expressivenessPct,
    topExpressiveEmotion: expressive.topExpressiveEmotion,
    expressiveEmotions: expressive.expressiveEmotions,
  };
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
  const total = pos + neu + neg;
  if (total === 0) return { positive: 0, neutral: 0, negative: 0 };
  return {
    positive: Math.round((pos / total) * 100),
    neutral: Math.round((neu / total) * 100),
    negative: Math.round((neg / total) * 100),
  };
}
