"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EmotionTrendRow } from "~/server/repositories/session";
import { getEmotionTrend } from "~/actions/sessions";
import { EMOTION_HEX, type EmotionView } from "~/lib/sentiment";
import { WINDOW_LABELS } from "~/lib/trend";

const NEUTRAL_KEY = "neutral";
const EMOTION_KEYS = Object.keys(EMOTION_HEX);
const EXPRESSIVE_KEYS = EMOTION_KEYS.filter((k) => k !== NEUTRAL_KEY);

type ChartRow = { date: string; [emotion: string]: string | number };

function flatten(rows: EmotionTrendRow[]): ChartRow[] {
  return rows.map((r) => ({ date: r.date, ...r.emotions }));
}

function isEmpty(rows: EmotionTrendRow[]): boolean {
  return rows.every((r) =>
    Object.values(r.emotions).every((v) => v === 0),
  );
}

function formatTick(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

interface Props {
  data: EmotionTrendRow[];
  windows: readonly number[];
  initialDays: number;
  view: EmotionView;
}

export function EmotionTrendChart({
  data,
  windows,
  initialDays,
  view,
}: Props) {
  const [rows, setRows] = useState<EmotionTrendRow[]>(data);
  const [days, setDays] = useState<number>(initialDays);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const chartData = useMemo(() => flatten(rows), [rows]);
  const empty = useMemo(() => isEmpty(rows), [rows]);
  const visibleKeys = view === "expressive" ? EXPRESSIVE_KEYS : EMOTION_KEYS;
  // Neutral dwarfs every expressive line; drop the fixed 0–100 ceiling in
  // expressive view so the remaining lines aren't flattened to the axis.
  const yDomain: [number, number | "auto"] =
    view === "expressive" ? [0, "auto"] : [0, 100];

  function selectWindow(d: number): void {
    if (d === days) return;
    setDays(d);
    startTransition(async () => {
      setRows(await getEmotionTrend(d));
    });
  }

  function toggle(emotion: string): void {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(emotion)) next.delete(emotion);
      else next.add(emotion);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-xs uppercase tracking-wide">
            Emotion trend
          </span>
          {isPending && (
            <span className="text-xs text-gray-400">updating…</span>
          )}
        </div>
        {windows.length > 1 && (
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs">
            {windows.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => selectWindow(w)}
                className={`px-3 py-1 ${
                  w === days
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {WINDOW_LABELS[w] ?? `${w}d`}
              </button>
            ))}
          </div>
        )}
      </div>

      {empty ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          No completed sessions in this window.
        </div>
      ) : (
        <>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatTick}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                  minTickGap={28}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                  labelFormatter={(label) => formatTick(String(label))}
                  formatter={(value, name) => [`${String(value)}%`, name]}
                />
                {visibleKeys.map((e) => (
                  <Line
                    key={e}
                    type="monotone"
                    dataKey={e}
                    name={e}
                    stroke={EMOTION_HEX[e]?.bg ?? "#6b7280"}
                    strokeWidth={2}
                    dot={false}
                    hide={hidden.has(e)}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-3">
            {visibleKeys.map((e) => {
              const off = hidden.has(e);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggle(e)}
                  className={`flex items-center gap-1.5 text-xs capitalize ${
                    off ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{
                      backgroundColor: off
                        ? "#d1d5db"
                        : (EMOTION_HEX[e]?.bg ?? "#6b7280"),
                    }}
                  />
                  <span className={off ? "line-through" : ""}>{e}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
