import {
  computeAverages,
  getSentimentBreakdown,
  type Score,
  type UtteranceData,
} from "~/types/analysis";

export interface SummaryResult {
  text: string;
}

// A stress peak is an utterance whose dominant emotion is a strong negative
// one. HR reads these to decide if a moment matters, so the summary lists the
// start times of the first few.
const STRESS_EMOTIONS = new Set(["anger", "disgust", "fear", "sadness"]);
const STRESS_CONFIDENCE_THRESHOLD = 0.6;
const MAX_LISTED_PEAKS = 5;

function dominant(scores: Score[]): Score | undefined {
  return [...scores].sort((a, b) => b.confidence - a.confidence)[0];
}

function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function generateSummary(utterances: UtteranceData[]): SummaryResult {
  const total = utterances.length;
  if (total === 0) {
    return { text: "No utterances detected in this session." };
  }

  // Sentiment % on the same averages the session stores, so the summary
  // matches the session card and exports.
  const { avgSentiments } = computeAverages(utterances);
  const sentiment = getSentimentBreakdown(avgSentiments);

  // Most frequent dominant emotion among the six Ekman emotions (neutral
  // excluded).
  const emotionCounts: Record<string, number> = {};
  const peakTimes: number[] = [];
  for (const u of utterances) {
    const top = dominant(u.emotions);
    if (!top) continue;
    if (top.label !== "neutral") {
      emotionCounts[top.label] = (emotionCounts[top.label] ?? 0) + 1;
    }
    if (STRESS_EMOTIONS.has(top.label) && top.confidence > STRESS_CONFIDENCE_THRESHOLD) {
      peakTimes.push(u.start_time);
    }
  }
  const mostFrequentEmotion = Object.entries(emotionCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const parts: string[] = [];
  parts.push(`${total} utterance${total !== 1 ? "s" : ""}.`);
  parts.push(
    `Sentiment: ${sentiment.positive}% positive, ${sentiment.neutral}% neutral, ${sentiment.negative}% negative.`,
  );
  if (mostFrequentEmotion) {
    parts.push(`Most frequent emotion: ${mostFrequentEmotion}.`);
  } else {
    parts.push("The session was mostly neutral.");
  }
  if (peakTimes.length > 0) {
    const listed = peakTimes
      .slice(0, MAX_LISTED_PEAKS)
      .map(formatTimestamp)
      .join(", ");
    parts.push(
      `${peakTimes.length} high-emotion moment${peakTimes.length !== 1 ? "s" : ""} (strong negative emotion) at ${listed}.`,
    );
  }

  return { text: parts.join(" ") };
}
