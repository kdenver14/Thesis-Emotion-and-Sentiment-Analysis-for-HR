"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { EmotionTrendRow } from "~/server/repositories/session";
import type {
  ExpressiveBreakdown,
  SentimentBreakdown,
  TopEmotionBreakdown,
} from "~/types/analysis";
import type { EmotionView } from "~/lib/sentiment";
import { EmotionBars } from "~/components/client/charts/EmotionBars";
import { EmotionTrendChart } from "~/components/client/charts/EmotionTrendChart";

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
  latestSession?: ReactNode;
}

export function EmotionPanel({
  metrics,
  trend,
  windows,
  initialDays,
  showTrend,
  sessionType,
  latestSession,
}: Props) {
  const [view, setView] = useState<EmotionView>("expressive");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">Emotion</h2>
        <div
          role="group"
          aria-label="Emotion view"
          className="inline-flex w-fit rounded-lg border border-gray-200 p-0.5"
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
      </div>

      <div
        className={`grid grid-cols-1 items-start gap-6 ${
          showTrend ? "md:grid-cols-2" : ""
        }`}
      >
        <div className="flex flex-col gap-6">
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
                />
              </motion.div>
            </AnimatePresence>
          </div>
          {latestSession}
        </div>

        {showTrend && (
          <EmotionTrendChart
            key={sessionType ?? "all"}
            data={trend}
            windows={windows}
            initialDays={initialDays}
            view={view}
            sessionType={sessionType}
          />
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
      className={`relative rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active ? "text-white" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {active && (
        <motion.span
          layoutId="emotionViewPill"
          className="absolute inset-0 rounded-md bg-gray-900"
          transition={{ duration: 0.32, ease: "easeInOut" }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
