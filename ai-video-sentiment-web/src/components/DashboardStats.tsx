import {
  distributePercents,
  type ExpressiveBreakdown,
  type SentimentBreakdown,
} from "~/types/analysis";

interface DashboardStatsProps {
  sessionCount: number;
  lineCount: number;
  sentiment: SentimentBreakdown;
  expressive: ExpressiveBreakdown;
}

// Left to right in reading order, positive first.
const SENTIMENT_ORDER = ["positive", "neutral", "negative"] as const;

function Tile({
  label,
  children,
  note,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  note: string;
  // Two grid cells on desktop, so the three sentiment figures stay on one
  // line; smaller screens keep a plain two by two grid.
  wide?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border border-gray-200 px-4 py-3 ${wide ? "lg:col-span-2" : ""}`}
    >
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tabular-nums text-gray-900">
          {children}
        </span>
        <span className="text-xs text-gray-500">{note}</span>
      </dd>
    </div>
  );
}

// Headline numbers for the dashboard, over the same completed sessions (and
// type filter) as the charts below. Every share is a share of lines.
export function DashboardStats({
  sessionCount,
  lineCount,
  sentiment,
  expressive,
}: DashboardStatsProps) {
  const top = expressive.expressiveEmotions[0];
  // Same rounding as the donut below, so the two never differ by 1.
  const topPct =
    distributePercents(
      expressive.expressiveEmotions.map((e) => e.confidence),
    )[0] ?? 0;
  // No lines yet (only processing or failed sessions): no shares to show.
  const hasLines = lineCount > 0;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile
        label="Sessions analysed"
        note={`${lineCount.toLocaleString()} lines of speech`}
      >
        {sessionCount.toLocaleString()}
      </Tile>
      <Tile label="Sentiment" note="Main tone of each line" wide>
        {hasLines
          ? SENTIMENT_ORDER.map((label) => (
              <span key={label} className="whitespace-nowrap">
                {sentiment[label]}%
                <span className="ml-1 text-xs font-normal text-gray-500">
                  {label}
                </span>
              </span>
            ))
          : "—"}
      </Tile>
      <Tile label="Expressive" note="Lines with an emotion other than neutral">
        {hasLines ? `${expressive.expressivenessPct}%` : "—"}
      </Tile>
      <Tile
        label="Top emotion"
        note={
          top ? `${topPct}% of expressive lines` : "No expressive lines yet"
        }
      >
        <span className="capitalize">{top?.label ?? "—"}</span>
      </Tile>
    </dl>
  );
}
