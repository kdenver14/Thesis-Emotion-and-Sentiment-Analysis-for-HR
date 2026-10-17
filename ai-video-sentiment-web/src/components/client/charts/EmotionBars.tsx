"use client";

import {
  distributePercents,
  type ExpressiveBreakdown,
  type Score,
  type SentimentBreakdown,
  type TopEmotionBreakdown,
} from "~/types/analysis";
import {
  emotionColorClass,
  emotionHex,
  sentimentToneClass,
  type EmotionView,
} from "~/lib/sentiment";

interface Props {
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  sentiment: SentimentBreakdown;
  view: EmotionView;
}

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

  const sentTotal =
    sentiment.positive + sentiment.neutral + sentiment.negative;
  const sentEntries = [
    ["positive", sentiment.positive],
    ["neutral", sentiment.neutral],
    ["negative", sentiment.negative],
  ] as const;
  const [sentLabel, sentVal] = sentEntries.reduce((a, b) =>
    b[1] > a[1] ? b : a,
  );
  const sentPct =
    sentTotal > 0 ? Math.round((sentVal / sentTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {sorted.map((s, i) => {
          const colors = emotionHex(s.label);
          const pct = barPcts[i] ?? 0;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="w-16 flex-shrink-0 text-xs font-medium capitalize"
                style={{ color: colors.text }}
              >
                {s.label}
              </span>
              <div className="h-2 flex-1 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: colors.bg }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right text-xs text-gray-400">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-gray-500">{caption}</div>

      {top && (
        <p className="border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-600">
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
                className={`font-medium capitalize ${sentimentToneClass(
                  sentLabel,
                )}`}
              >
                {SENTIMENT_WORD[sentLabel] ?? sentLabel}
              </span>{" "}
              ({sentPct}%)
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}
