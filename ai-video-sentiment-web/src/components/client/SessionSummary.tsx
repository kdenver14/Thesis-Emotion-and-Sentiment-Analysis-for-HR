import { FiActivity, FiAlertTriangle } from "react-icons/fi";
import { BreakdownDonutLazy } from "~/components/client/charts/BreakdownDonutLazy";
import type { DonutSlice } from "~/components/client/charts/BreakdownDonut";

interface SessionSummaryProps {
  // "Session Summary" on a session; the employee page reuses the card.
  title?: string;
  // Integer percents that sum to 100.
  sentiment: { positive: number; neutral: number; negative: number };
  sentimentDescription: string;
  // Share of each emotion among the non-neutral utterances, largest first.
  emotionSlices: DonutSlice[];
  // Shown when there are emotion slices; otherwise a generic line.
  emotionsDescription: string;
  peakCount?: number;
  peakTimes?: string[];
  // The session page's own URL. When set, each legend label links to it with
  // ?sentiment= or ?emotion= so the transcript below shows those lines.
  filterPath?: string;
}

function filterLinks(
  filterPath: string | undefined,
  param: "sentiment" | "emotion",
  slices: DonutSlice[],
): Record<string, string> | undefined {
  if (!filterPath) return undefined;
  return Object.fromEntries(
    slices.map((s) => [
      s.label,
      `${filterPath}?${param}=${encodeURIComponent(s.label)}#transcript`,
    ]),
  );
}

// Two halves with the same anatomy (title, one-line description, donut with
// legend), so headings, charts and legends line up across the card.
export function SessionSummary({
  title = "Session Summary",
  sentiment,
  sentimentDescription,
  emotionSlices,
  emotionsDescription,
  peakCount = 0,
  peakTimes = [],
  filterPath,
}: SessionSummaryProps) {
  // Fixed positive/neutral/negative order; the donut centers the largest.
  const sentimentSlices: DonutSlice[] = [
    { label: "positive", value: sentiment.positive },
    { label: "neutral", value: sentiment.neutral },
    { label: "negative", value: sentiment.negative },
  ];
  const hasSentiment = sentimentSlices.some((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <FiActivity className="h-4 w-4 text-gray-400" aria-hidden />
          AI-generated analysis
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        <Half
          title="Sentiment"
          description={sentimentDescription}
          className="pb-6 md:pb-0 md:pr-8"
        >
          {hasSentiment ? (
            <BreakdownDonutLazy
              slices={sentimentSlices}
              palette="sentiment"
              links={filterLinks(filterPath, "sentiment", sentimentSlices)}
            />
          ) : (
            <Empty>No sentiment detected.</Empty>
          )}
        </Half>
        <Half
          title="Emotions"
          description={
            emotionSlices.length > 0
              ? emotionsDescription
              : "Main emotion of each utterance"
          }
          className="border-t border-gray-100 pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0"
        >
          {emotionSlices.length > 0 ? (
            <BreakdownDonutLazy
              slices={emotionSlices}
              palette="emotion"
              links={filterLinks(filterPath, "emotion", emotionSlices)}
            />
          ) : (
            <Empty>Every utterance was neutral.</Empty>
          )}
        </Half>
      </div>

      {peakCount > 0 && (
        <p className="flex items-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
          <FiAlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
            aria-hidden
          />
          <span>
            {peakCount} high-emotion moment{peakCount !== 1 ? "s" : ""} (strong
            negative emotion) at {peakTimes.join(", ")}
            {peakCount > peakTimes.length ? ", ..." : ""}
          </span>
        </p>
      )}
    </div>
  );
}

function Half({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-medium text-gray-800">{title}</h4>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {/* Donut beside its legend; stacked on phones, where both don't fit. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-40 items-center text-sm text-gray-400">{children}</p>
  );
}
