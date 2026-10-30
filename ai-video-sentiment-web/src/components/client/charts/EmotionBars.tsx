"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
  // True when nothing sits beside this card (no trend chart), so the caption
  // and summary move into the free column instead of stacking underneath.
  wide?: boolean;
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
  wide = false,
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
  const pieData = sorted
    .map((s, i) => ({ label: s.label, value: barPcts[i] ?? 0 }))
    .filter((d) => d.value > 0);

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

  const captionNode = <div className="text-xs text-gray-500">{caption}</div>;
  const summaryNode = top ? (
    <p className="text-xs leading-relaxed text-gray-600">
      Across all analyzed sessions, the most common emotion is{" "}
      <span className={`font-medium capitalize ${emotionColorClass(top.label)}`}>
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative h-40 w-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={1}
                stroke="none"
                isAnimationActive={false}
              >
                {pieData.map((d) => (
                  <Cell key={d.label} fill={emotionHex(d.label).bg} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${String(value)}%`, String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          {top && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold text-gray-900">
                {topPct}%
              </span>
              <span
                className="text-xs font-medium capitalize"
                style={{ color: emotionHex(top.label).text }}
              >
                {top.label}
              </span>
            </div>
          )}
        </div>
        <ul className="flex w-44 flex-shrink-0 flex-col gap-1.5">
          {pieData.map((d) => (
            <li key={d.label} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: emotionHex(d.label).bg }}
              />
              <span className="flex-1 capitalize text-gray-600">{d.label}</span>
              <span className="tabular-nums text-gray-400">{d.value}%</span>
            </li>
          ))}
        </ul>
        {wide && (
          <div className="flex min-w-0 flex-1 flex-col gap-2 border-gray-100 sm:border-l sm:pl-6">
            {captionNode}
            {summaryNode}
          </div>
        )}
      </div>
      {!wide && (
        <>
          {captionNode}
          {summaryNode && (
            <div className="border-t border-gray-100 pt-3">{summaryNode}</div>
          )}
        </>
      )}
    </div>
  );
}
