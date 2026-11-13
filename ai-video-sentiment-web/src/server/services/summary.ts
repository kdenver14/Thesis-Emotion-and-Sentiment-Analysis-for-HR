import {
  countTopEmotions,
  countTopSentiments,
  mainScore,
  sentimentFromCounts,
  topLabel,
  type SentimentBreakdown,
  type UtteranceData,
} from "~/types/analysis";
import { formatTimestamp } from "~/lib/dates";

// `text` is what gets stored; the other fields are the same facts for the
// session page's visual summary, so both always agree. Sentiment is the
// share of lines (sentimentFromCounts), like everywhere else in the app.
export interface SummaryResult {
  text: string;
  total: number;
  sentiment: SentimentBreakdown;
  // Most frequent dominant emotion, neutral excluded; null when none.
  mostFrequentEmotion: string | null;
  peakCount: number;
  // Start times (mm:ss) of the first few high-emotion moments.
  peakTimes: string[];
}

type SummaryInput = Pick<
  UtteranceData,
  "start_time" | "emotions" | "sentiments"
>;

// A stress peak is an utterance whose dominant emotion is a strong negative
// one. HR reads these to decide if a moment matters, so the summary lists the
// start times of the first few.
const STRESS_EMOTIONS = new Set(["anger", "disgust", "fear", "sadness"]);
const STRESS_CONFIDENCE_THRESHOLD = 0.6;
const MAX_LISTED_PEAKS = 5;

export function generateSummary(utterances: SummaryInput[]): SummaryResult {
  const total = utterances.length;
  if (total === 0) {
    return {
      text: "No utterances detected in this session.",
      total: 0,
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      mostFrequentEmotion: null,
      peakCount: 0,
      peakTimes: [],
    };
  }

  const sentiment = sentimentFromCounts(countTopSentiments(utterances));

  // Most frequent dominant emotion among the six Ekman emotions (neutral
  // excluded).
  const emotionCounts: Record<string, number> = {};
  const peakTimes: number[] = [];
  for (const u of utterances) {
    const top = mainScore(u.emotions);
    if (!top) continue;
    if (top.label !== "neutral") {
      emotionCounts[top.label] = (emotionCounts[top.label] ?? 0) + 1;
    }
    if (
      STRESS_EMOTIONS.has(top.label) &&
      top.confidence > STRESS_CONFIDENCE_THRESHOLD
    ) {
      peakTimes.push(u.start_time);
    }
  }
  const mostFrequentEmotion = Object.entries(emotionCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const parts: string[] = [];
  parts.push(`${total} utterance${total !== 1 ? "s" : ""}.`);
  parts.push(
    `Sentiment by line: ${sentiment.positive}% positive, ${sentiment.neutral}% neutral, ${sentiment.negative}% negative.`,
  );
  if (mostFrequentEmotion) {
    parts.push(`Most frequent emotion: ${mostFrequentEmotion}.`);
  } else {
    parts.push("The session was mostly neutral.");
  }
  const listedPeaks = peakTimes.slice(0, MAX_LISTED_PEAKS).map(formatTimestamp);
  if (peakTimes.length > 0) {
    parts.push(
      `${peakTimes.length} high-emotion moment${peakTimes.length !== 1 ? "s" : ""} (strong negative emotion) at ${listedPeaks.join(", ")}.`,
    );
  }

  return {
    text: parts.join(" "),
    total,
    sentiment,
    mostFrequentEmotion: mostFrequentEmotion ?? null,
    peakCount: peakTimes.length,
    peakTimes: listedPeaks,
  };
}

// Everything a session stores that is derived from its lines. The result
// callback, the startup fill and the backfill script all use this, so a
// session's stored figures can never disagree with each other.
export interface SessionTallies {
  emotionCounts: string;
  sentimentCounts: string;
  utteranceCount: number;
  topSentiment: string;
  summary: string;
}

export function computeSessionTallies(
  utterances: SummaryInput[],
): SessionTallies {
  const sentimentCounts = countTopSentiments(utterances);
  return {
    emotionCounts: JSON.stringify(countTopEmotions(utterances)),
    sentimentCounts: JSON.stringify(sentimentCounts),
    utteranceCount: utterances.length,
    topSentiment: topLabel(sentimentCounts),
    summary: generateSummary(utterances).text,
  };
}
