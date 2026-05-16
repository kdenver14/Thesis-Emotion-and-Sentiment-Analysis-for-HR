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
