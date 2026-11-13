"use client";

import {
  distributePercents,
  type ExpressiveBreakdown,
  type Score,
  type SentimentBreakdown,
  type TopEmotionBreakdown,
} from "~/types/analysis";
import {
  EMOTION_HEX,
  emotionColorClass,
  sentimentToneClass,
  type EmotionView,
} from "~/lib/sentiment";
import { BreakdownDonut } from "./BreakdownDonut";

interface Props {
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  sentiment: SentimentBreakdown;
  view: EmotionView;
}

// Container query on the card's own width (not the screen's): at 40rem and
// up the caption and summary sit beside the donut in what was empty space;
// narrower cards stack them underneath.
const SIDE_WHEN_WIDE = "hidden [@container(min-width:40rem)]:flex";
const BELOW_WHEN_NARROW = "flex [@container(min-width:40rem)]:hidden";

const SENTIMENT_WORD: Record<string, string> = {
  positive: "positive",
  neutral: "neutral",
  negative: "negative",
};

export function EmotionBars({
  expressive,
  allEmotions,
  sentiment,
  view,
}: Props) {
  const bars: Score[] =
    view === "expressive"
      ? expressive.expressiveEmotions
      : allEmotions.breakdown;
  const caption =
    view === "expressive"
      ? `${expressive.expressivenessPct}% expressive overall`
      : `${allEmotions.total} utterances analyzed`;

  if (bars.length === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-2xl font-semibold text-gray-300">—</div>
        <div className="text-xs text-gray-500">
          {view === "expressive"
            ? "0% expressive overall"
            : "0 utterances analyzed"}
        </div>
      </div>
    );
  }

  const sorted = [...bars].sort((a, b) => b.confidence - a.confidence);
  // Per-bar integer percentages that always sum to 100 (Hamilton); indexed
  // positionally to the sorted bars.
  const barPcts = distributePercents(sorted.map((s) => s.confidence));

  const top = sorted[0];
  const topPct = barPcts[0] ?? 0;

  // Donut slices, positionally aligned to the Hamilton percents so the pie
  // and the legend show the same integers that always sum to 100. Zero
  // slices are dropped so the "expressive only" view has no empty wedges.
  const detected = sorted
    .map((s, i) => ({ label: s.label, value: barPcts[i] ?? 0 }))
    .filter((d) => d.value > 0);
  // "All emotions" names every emotion: the ones no line showed are listed
  // at 0% (the donut draws no arc for them).
  const pieData =
    view === "all"
      ? [
          ...detected,
          ...Object.keys(EMOTION_HEX)
            .filter((e) => !detected.some((d) => d.label === e))
            .map((label) => ({ label, value: 0 })),
        ]
      : detected;

  const sentTotal = sentiment.positive + sentiment.neutral + sentiment.negative;
  const sentEntries = [
    ["positive", sentiment.positive],
    ["neutral", sentiment.neutral],
    ["negative", sentiment.negative],
  ] as const;
  const [sentLabel, sentVal] = sentEntries.reduce((a, b) =>
    b[1] > a[1] ? b : a,
  );
  const sentPct = sentTotal > 0 ? Math.round((sentVal / sentTotal) * 100) : 0;

  const captionNode = <div className="text-xs text-gray-500">{caption}</div>;
  const summaryNode = top ? (
    <p className="text-xs leading-relaxed text-gray-600">
      Across all analyzed sessions, the most common emotion is{" "}
      <span
        className={`font-medium capitalize ${emotionColorClass(top.label)}`}
      >
        {top.label}
      </span>{" "}
      ({topPct}%)
      {sentTotal > 0 && (
        <>
          , and overall sentiment is{" "}
          <span
            className={`font-medium capitalize ${sentimentToneClass(sentLabel)}`}
          >
            {SENTIMENT_WORD[sentLabel] ?? sentLabel}
          </span>{" "}
          ({sentPct}%)
        </>
      )}
      .
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-3 [container-type:inline-size]">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <BreakdownDonut slices={pieData} palette="emotion" />
        <div
          className={`${SIDE_WHEN_WIDE} min-w-0 flex-1 flex-col gap-2 border-l border-gray-100 pl-6`}
        >
          {captionNode}
          {summaryNode}
        </div>
      </div>
      <div className={`${BELOW_WHEN_NARROW} flex-col gap-3`}>
        {captionNode}
        {summaryNode && (
          <div className="border-t border-gray-100 pt-3">{summaryNode}</div>
        )}
      </div>
    </div>
  );
}
