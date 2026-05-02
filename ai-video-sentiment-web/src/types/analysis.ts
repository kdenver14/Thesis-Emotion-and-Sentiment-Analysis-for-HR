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
  "exit_interview",
  "training",
  "meeting",
] as const;

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  interview: "Interview",
  performance_review: "Performance Review",
  onboarding: "Onboarding",
  exit_interview: "Exit Interview",
  training: "Training",
  meeting: "Meeting",
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
