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
  "general",
  "interview",
  "performance_review",
  "onboarding",
  "exit_interview",
  "training",
] as const;

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  general: "General",
  interview: "Interview",
  performance_review: "Performance Review",
  onboarding: "Onboarding",
  exit_interview: "Exit Interview",
  training: "Training",
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
  emotions: Score[];
  sentiments: Score[];
}

export interface InferenceResult {
  utterances: UtteranceData[];
}

export interface SessionMetadataInput {
  title: string;
  sessionType: SessionType;
  employeeId?: string;
  sessionDate?: string;
}
