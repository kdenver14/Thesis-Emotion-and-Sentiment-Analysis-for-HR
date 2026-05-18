"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ExpressiveBreakdown,
  TopEmotionBreakdown,
} from "~/types/analysis";
import { emotionColorClass } from "~/lib/sentiment";

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

type View = "expressive" | "all";

interface Props {
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  totalLabel?: string;
  size?: "sm" | "lg";
}

export function ExpressiveToggle({
  expressive,
  allEmotions,
  totalLabel = "utterances analyzed",
  size = "lg",
}: Props) {
  const [view, setView] = useState<View>("expressive");

  const topExprPct = Math.round(
    (expressive.expressiveEmotions[0]?.confidence ?? 0) * 100,
  );

  const heading =
    size === "lg" ? "text-2xl font-semibold" : "text-sm font-medium";
  const subheading = "text-xs text-gray-500";

  return (
    <div className="flex flex-col gap-2">
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

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.96 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="flex flex-col gap-0.5"
        >
          <ViewContent
            view={view}
            expressive={expressive}
            allEmotions={allEmotions}
            topExprPct={topExprPct}
            totalLabel={totalLabel}
            heading={heading}
            subheading={subheading}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ViewContent({
  view,
  expressive,
  allEmotions,
  topExprPct,
  totalLabel,
  heading,
  subheading,
}: {
  view: View;
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  topExprPct: number;
  totalLabel: string;
  heading: string;
  subheading: string;
}) {
  if (view === "expressive") {
    if (expressive.expressivenessPct === 0) {
      return (
        <>
          <div className={`${heading} text-gray-300`}>—</div>
          <div className={subheading}>0% expressive overall</div>
        </>
      );
    }
    return (
      <>
        <div className={`${heading} flex items-center gap-2 capitalize`}>
          <span>{EMOTION_EMOJI[expressive.topExpressiveEmotion] ?? ""}</span>
          <span className={emotionColorClass(expressive.topExpressiveEmotion)}>
            {expressive.topExpressiveEmotion} {topExprPct}%
          </span>
        </div>
        <div className={subheading}>
          {expressive.expressivenessPct}% expressive overall
        </div>
      </>
    );
  }

  if (allEmotions.total === 0) {
    return (
      <>
        <div className={`${heading} text-gray-300`}>—</div>
        <div className={subheading}>0 {totalLabel}</div>
      </>
    );
  }
  return (
    <>
      <div className={`${heading} flex items-center gap-2 capitalize`}>
        <span>{EMOTION_EMOJI[allEmotions.topEmotion] ?? ""}</span>
        <span className={emotionColorClass(allEmotions.topEmotion)}>
          {allEmotions.topEmotion} {allEmotions.topEmotionPct}%
        </span>
      </div>
      <div className={subheading}>
        {allEmotions.total} {totalLabel}
      </div>
    </>
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
          layoutId="exprTogglePill"
          className="absolute inset-0 rounded-md bg-gray-900"
          transition={{ duration: 0.32, ease: "easeInOut" }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}
