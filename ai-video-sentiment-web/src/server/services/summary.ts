import { type UtteranceData } from "~/types/analysis";

export interface SummaryResult {
  text: string;
  stressPeaks: number;
  hasDisengagement: boolean;
  hasPositiveMoments: boolean;
  emotionalTrajectory: "improving" | "declining" | "stable" | "volatile";
}

const NEGATIVE_EMOTIONS = new Set(["anger", "disgust", "fear", "sadness"]);

function positiveRatioOf(utterances: UtteranceData[]): number {
  if (utterances.length === 0) return 0;
  let pos = 0;
  for (const u of utterances) {
    const top = [...u.sentiments].sort((a, b) => b.confidence - a.confidence)[0];
    if (top?.label === "positive") pos++;
  }
  return pos / utterances.length;
}

export function generateSummary(utterances: UtteranceData[]): SummaryResult {
  if (utterances.length === 0) {
    return {
      text: "No utterances detected in this session.",
      stressPeaks: 0,
      hasDisengagement: false,
      hasPositiveMoments: false,
      emotionalTrajectory: "stable",
    };
  }

  const total = utterances.length;
  let stressPeaks = 0;
  let positiveCount = 0;
  let neutralCount = 0;

  for (const utterance of utterances) {
    const topEmotion = [...utterance.emotions].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    const topSentiment = [...utterance.sentiments].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];

    if (
      topEmotion &&
      NEGATIVE_EMOTIONS.has(topEmotion.label) &&
      topEmotion.confidence > 0.6
    ) {
      stressPeaks++;
    }

    if (topSentiment) {
      if (topSentiment.label === "positive") positiveCount++;
      else if (topSentiment.label === "neutral") neutralCount++;
    }
  }

  const positiveRatio = positiveCount / total;
  const neutralRatio = neutralCount / total;

  const uniqueEmotions = new Set(
    utterances.map((u) => {
      const top = [...u.emotions].sort(
        (a, b) => b.confidence - a.confidence,
      )[0];
      return top?.label;
    }),
  );
  const emotionVariety = Math.min(uniqueEmotions.size / 5, 1);

  const hasDisengagement =
    neutralRatio > 0.85 && emotionVariety < 0.4;
  const hasPositiveMoments = positiveCount >= 2 && positiveRatio > 0.2;

  const half = Math.floor(total / 2);
  const firstPos = positiveRatioOf(utterances.slice(0, half));
  const secondPos = positiveRatioOf(utterances.slice(half));
  const diff = secondPos - firstPos;

  let emotionalTrajectory: SummaryResult["emotionalTrajectory"];
  if (stressPeaks > total * 0.3) {
    emotionalTrajectory = "volatile";
  } else if (diff > 0.15) {
    emotionalTrajectory = "improving";
  } else if (diff < -0.15) {
    emotionalTrajectory = "declining";
  } else {
    emotionalTrajectory = "stable";
  }

  const parts: string[] = [];
  parts.push(`Session contains ${total} utterance${total !== 1 ? "s" : ""}.`);

  if (emotionalTrajectory === "improving") {
    parts.push("Emotional tone improved over the course of the session.");
  } else if (emotionalTrajectory === "declining") {
    parts.push("Emotional tone declined over the course of the session.");
  } else if (emotionalTrajectory === "volatile") {
    parts.push("Emotional tone was volatile with significant variation.");
  } else {
    parts.push("Emotional tone remained stable throughout the session.");
  }

  if (stressPeaks > 0) {
    parts.push(
      `${stressPeaks} stress peak${stressPeaks !== 1 ? "s" : ""} detected (high-intensity negative emotion).`,
    );
  }
  if (hasDisengagement) {
    parts.push(
      "Signs of disengagement observed (predominantly neutral affect).",
    );
  }
  if (hasPositiveMoments) {
    parts.push("Notable positive moments present in the session.");
  }

  return {
    text: parts.join(" "),
    stressPeaks,
    hasDisengagement,
    hasPositiveMoments,
    emotionalTrajectory,
  };
}
