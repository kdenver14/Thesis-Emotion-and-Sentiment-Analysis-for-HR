"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FiBarChart2, FiX } from "react-icons/fi";
import type { MonthComparison, PeriodStats } from "~/server/services/reports";
import type { MonthCompareDatum } from "~/components/client/charts/MonthCompareChart";
import { SESSION_TYPE_LABELS } from "~/types/analysis";

// Two grays, told apart by lightness (the UI is monochrome); the legend and
// the value on every bar carry identity too, never the shade alone.
const PREVIOUS_FILL = "#9ca3af";
const CURRENT_FILL = "#1f2937";

// The bar chart's code loads only when the dialog opens.
const MonthCompareChart = dynamic(
  () =>
    import("~/components/client/charts/MonthCompareChart").then(
      (m) => m.MonthCompareChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-lg bg-gray-50" />
    ),
  },
);

const METRICS: { metric: string; value: (s: PeriodStats) => number }[] = [
  { metric: "Positive", value: (s) => s.sentiment.positive },
  { metric: "Neutral", value: (s) => s.sentiment.neutral },
  { metric: "Negative", value: (s) => s.sentiment.negative },
  { metric: "Expressive", value: (s) => s.expressivenessPct },
];

function topEmotionText(s: PeriodStats): string {
  if (!s.topEmotion) return "none";
  const { label, pct } = s.topEmotion;
  return `${label[0]?.toUpperCase() ?? ""}${label.slice(1)} (${pct}% of expressive lines)`;
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

// "12 sessions, 3,040 lines": the line count shows how much a share rests on.
function sizeText(s: PeriodStats): string {
  return `${plural(s.sessionCount, "session")}, ${plural(s.lineCount, "line")}`;
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

// HR Manager's dashboard button: this month so far against last month, as a
// graph. The HR Director gets the full quarterly table on the Reports tab.
export function MonthCompareButton({
  data,
  typeFilter,
}: {
  data: MonthComparison;
  // The dashboard's session type filter, which the figures follow.
  typeFilter?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeLabel = typeFilter ? SESSION_TYPE_LABELS[typeFilter] : undefined;
  const { previous, current } = data;
  const currentLabel = `${current.label}, to date`;
  const comparable = previous.lineCount > 0 && current.lineCount > 0;
  const chartData: MonthCompareDatum[] = METRICS.map(({ metric, value }) => ({
    metric,
    previous: value(previous),
    current: value(current),
  }));

  useEffect(() => {
    if (!open) return;
    // The trigger stays mounted, so the node read now is the one to refocus.
    const trigger = triggerRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      // Close is the only control inside, so Tab stays on it rather than
      // reaching the page behind the backdrop.
      if (e.key === "Tab") e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Back to the button that opened the dialog.
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FiBarChart2 className="h-3.5 w-3.5" aria-hidden />
        Compare months
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="month-compare-title"
          aria-describedby="month-compare-caption"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative my-auto flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <h2
                  id="month-compare-title"
                  className="text-sm font-medium text-gray-900"
                >
                  This month vs last month
                </h2>
                <p id="month-compare-caption" className="text-xs text-gray-500">
                  {typeLabel ? `${typeLabel} sessions only. ` : ""}
                  {previous.label}: {sizeText(previous)}. {current.label} so
                  far: {sizeText(current)}.
                  {comparable ? " Each bar is a share of lines of speech." : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                autoFocus
                className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {comparable ? (
              <>
                <div className="flex flex-wrap gap-4">
                  <Swatch color={PREVIOUS_FILL} label={previous.label} />
                  <Swatch color={CURRENT_FILL} label={currentLabel} />
                </div>
                <div className="h-64" aria-hidden>
                  <MonthCompareChart
                    data={chartData}
                    previousLabel={previous.label}
                    currentLabel={currentLabel}
                    previousFill={PREVIOUS_FILL}
                    currentFill={CURRENT_FILL}
                  />
                </div>
                {/* The same numbers for screen readers. */}
                <table className="sr-only">
                  <caption>Share of lines, last month and this month</caption>
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col">{previous.label}</th>
                      <th scope="col">{currentLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d) => (
                      <tr key={d.metric}>
                        <th scope="row">{d.metric}</th>
                        <td>{d.previous}%</td>
                        <td>{d.current}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-600">
                  Top expressive emotion: {topEmotionText(previous)} in{" "}
                  {previous.label}, {topEmotionText(current)} so far in{" "}
                  {current.label}.
                </p>
              </>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 text-center text-sm text-gray-400">
                {previous.lineCount === 0
                  ? `No lines of speech in ${previous.label} to compare with yet.`
                  : `No lines of speech in ${current.label} yet.`}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
