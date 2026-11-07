// Intentional, bounded exception to the monochrome design system:
// sentiment/emotion semantics are color-coded for fast visual scanning.
// Use ONLY for sentiment percentages, overall sentiment, and emotion labels.

export const POSITIVE_CLASS = "text-green-600";
export const NEGATIVE_CLASS = "text-red-600";
export const NEUTRAL_CLASS = "text-gray-500";

// Each emotion's own label color: the Tailwind 3 twin of EMOTION_HEX[e].text
// below (same hex), so a label always matches its chart slice and line.
// Literal strings so Tailwind generates them.
const EMOTION_TEXT_CLASS: Record<string, string> = {
  anger: "text-red-600",
  disgust: "text-violet-600",
  fear: "text-orange-600",
  joy: "text-green-600",
  neutral: "text-gray-600",
  sadness: "text-blue-600",
  surprise: "text-yellow-600",
};

export function emotionColorClass(emotion: string): string {
  return EMOTION_TEXT_CLASS[emotion.toLowerCase()] ?? NEUTRAL_CLASS;
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

// Sentiment chart hex; text values equal POSITIVE/NEUTRAL/NEGATIVE_CLASS.
export const SENTIMENT_HEX: Record<string, { bg: string; text: string }> = {
  positive: { bg: "#22c55e", text: "#16a34a" },
  neutral: { bg: "#9ca3af", text: "#6b7280" },
  negative: { bg: "#ef4444", text: "#dc2626" },
};

export function sentimentHex(sentiment: string): { bg: string; text: string } {
  return SENTIMENT_HEX[sentiment.toLowerCase()] ?? EMOTION_HEX_DEFAULT;
}

// Shared expressive/all selector mode. One source so the dashboard's single
// toggle can drive both the bar graph and the trend line chart.
export type EmotionView = "expressive" | "all";
