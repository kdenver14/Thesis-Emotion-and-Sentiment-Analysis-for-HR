"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import type { EmotionTrendRow } from "~/server/repositories/session";
import type {
  ExpressiveBreakdown,
  SentimentBreakdown,
  TopEmotionBreakdown,
} from "~/types/analysis";
import type { EmotionView } from "~/lib/sentiment";

// Both charts pull in recharts, which dwarfs the rest of the dashboard
// bundle. Loading them on demand keeps the initial payload small on slow
// connections; the placeholders reserve the same height so nothing jumps.
const ChartSkeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-gray-50 ${className ?? ""}`} />
);

const EmotionBars = dynamic(
  () => import("~/components/client/charts/EmotionBars").then((m) => m.EmotionBars),
  { ssr: false, loading: () => <ChartSkeleton className="h-40 w-full" /> },
);

const EmotionTrendChart = dynamic(
  () =>
    import("~/components/client/charts/EmotionTrendChart").then(
      (m) => m.EmotionTrendChart,
    ),
  { ssr: false, loading: () => <ChartSkeleton className="h-80 w-full" /> },
);

interface Props {
  metrics: {
    expressive: ExpressiveBreakdown;
    allEmotions: TopEmotionBreakdown;
    sentiment: SentimentBreakdown;
  };
  trend: EmotionTrendRow[];
  windows: readonly number[];
  initialDays: number;
  showTrend: boolean;
  // Active ?type= filter from the dashboard URL. Passed to the trend chart
  // so the chart's own window-pill refetches stay type-scoped. The chart is
  // keyed on this value so a type change remounts it with the fresh `trend`
  // prop (initial state would otherwise stick to the old data).
  sessionType?: string;
  // Page-level actions (exports) rendered at the end of the control row, so
  // the dashboard shows one toolbar instead of two stacked ones.
  actions?: ReactNode;
}

export function EmotionPanel({
  metrics,
  trend,
  windows,
  initialDays,
  showTrend,
  sessionType,
  actions,
}: Props) {
  const [view, setView] = useState<EmotionView>("expressive");

  return (
    <div className="flex flex-col gap-4">
      {/* Single control row for the whole page: the view switch sits on the
          left, page actions (type filter, exports) on the right, so the
          controls are not crowded into one corner. All share one height and
          border treatment. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Emotion view"
          className="inline-flex w-fit rounded-md border border-gray-200 p-0.5"
        >
          <ToggleButton
            active={view === "expressive"}
            onClick={() => setView("expressive")}
            label="Expressive only"
          />
          <ToggleButton
            active={view === "all"}
            onClick={() => setView("all")}
            label="All emotions"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${showTrend ? "md:grid-cols-2" : ""}`}
      >
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Top emotions
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              <EmotionBars
                expressive={metrics.expressive}
                allEmotions={metrics.allEmotions}
                sentiment={metrics.sentiment}
                view={view}
                wide={!showTrend}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {showTrend && (
          <div className="h-full">
            <EmotionTrendChart
              key={sessionType ?? "all"}
              data={trend}
              windows={windows}
              initialDays={initialDays}
              view={view}
              sessionType={sessionType}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative rounded px-3 py-1 text-sm font-medium transition-colors ${
        active ? "text-white" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {active && (
        <motion.span
          layoutId="emotionViewPill"
          className="absolute inset-0 rounded bg-gray-900"
          transition={{ duration: 0.32, ease: "easeInOut" }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
