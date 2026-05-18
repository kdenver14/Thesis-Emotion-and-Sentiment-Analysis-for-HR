// Intentional, bounded exception to the monochrome design system:
// sentiment/emotion semantics are color-coded for fast visual scanning.
// Use ONLY for sentiment percentages, overall sentiment, and emotion labels.

const POSITIVE_EMOTIONS = new Set(["joy", "surprise"]);
const NEGATIVE_EMOTIONS = new Set(["anger", "disgust", "fear", "sadness"]);

export const POSITIVE_CLASS = "text-green-600";
export const NEGATIVE_CLASS = "text-red-600";
export const NEUTRAL_CLASS = "text-gray-500";

export function emotionColorClass(emotion: string): string {
  const e = emotion.toLowerCase();
  if (POSITIVE_EMOTIONS.has(e)) return POSITIVE_CLASS;
  if (NEGATIVE_EMOTIONS.has(e)) return NEGATIVE_CLASS;
  return NEUTRAL_CLASS;
}

export function sentimentToneClass(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s.startsWith("pos")) return POSITIVE_CLASS;
  if (s.startsWith("neg")) return NEGATIVE_CLASS;
  return NEUTRAL_CLASS;
}

// Per-emotion chart hex (bg = fill/stroke, text = label color).
// Single source for recharts / inline-style consumers — Tailwind cannot
// generate utilities from runtime values, so charts use raw hex here.
// Sanctioned color exception (charts), same as the text classes above.
export const EMOTION_HEX: Record<string, { bg: string; text: string }> = {
  anger: { bg: "#ef4444", text: "#dc2626" },
  disgust: { bg: "#a855f7", text: "#7c3aed" },
  fear: { bg: "#f97316", text: "#ea580c" },
  joy: { bg: "#22c55e", text: "#16a34a" },
  neutral: { bg: "#6b7280", text: "#4b5563" },
  sadness: { bg: "#3b82f6", text: "#2563eb" },
  surprise: { bg: "#eab308", text: "#ca8a04" },
};

export const EMOTION_HEX_DEFAULT = { bg: "#6b7280", text: "#4b5563" };

export function emotionHex(emotion: string): { bg: string; text: string } {
  return EMOTION_HEX[emotion.toLowerCase()] ?? EMOTION_HEX_DEFAULT;
}

// Shared expressive/all selector mode. One source so the dashboard's single
// toggle can drive both the bar graph and the trend line chart.
export type EmotionView = "expressive" | "all";
