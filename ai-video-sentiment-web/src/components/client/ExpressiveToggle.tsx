"use client";

import { useState } from "react";
import type {
  ExpressiveBreakdown,
  TopEmotionBreakdown,
} from "~/types/analysis";

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
    size === "lg"
      ? "text-2xl font-semibold"
      : "text-sm font-medium";
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

      {view === "expressive" ? (
        expressive.expressivenessPct === 0 ? (
          <div className="flex flex-col gap-0.5">
            <div className={`${heading} text-gray-300`}>—</div>
            <div className={subheading}>0% expressive overall</div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className={`${heading} flex items-center gap-2 capitalize text-gray-800`}>
              <span>{EMOTION_EMOJI[expressive.topExpressiveEmotion] ?? ""}</span>
              <span>
                {expressive.topExpressiveEmotion} {topExprPct}%
              </span>
            </div>
            <div className={subheading}>
              {expressive.expressivenessPct}% expressive overall
            </div>
          </div>
        )
      ) : allEmotions.total === 0 ? (
        <div className="flex flex-col gap-0.5">
          <div className={`${heading} text-gray-300`}>—</div>
          <div className={subheading}>0 {totalLabel}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <div className={`${heading} flex items-center gap-2 capitalize text-gray-800`}>
            <span>{EMOTION_EMOJI[allEmotions.topEmotion] ?? ""}</span>
            <span>
              {allEmotions.topEmotion} {allEmotions.topEmotionPct}%
            </span>
          </div>
          <div className={subheading}>
            {allEmotions.total} {totalLabel}
          </div>
        </div>
      )}
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
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {label}
    </button>
  );
}
