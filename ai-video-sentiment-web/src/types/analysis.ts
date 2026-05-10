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
}

export function computeTopEmotion(
  utterances: { emotions: Score[] }[],
): TopEmotionBreakdown {
  if (utterances.length === 0) {
    return { topEmotion: "neutral", topEmotionPct: 0, total: 0 };
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
  return {
    topEmotion: first?.[0] ?? "neutral",
    topEmotionPct: first ? Math.round((first[1] / utterances.length) * 100) : 0,
    total: utterances.length,
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
