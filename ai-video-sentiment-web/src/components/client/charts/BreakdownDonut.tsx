"use client";

import { useState } from "react";
import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { emotionHex, sentimentHex } from "~/lib/sentiment";

export type DonutSlice = { label: string; value: number };

interface BreakdownDonutProps {
  // Integer percents in legend order. Zero slices stay in the legend but get
  // no arc.
  slices: DonutSlice[];
  // A name, not a function: Server Components can only pass data here.
  palette: "emotion" | "sentiment";
  // Optional label -> URL; a linked legend label opens those lines (the
  // session page filters its transcript). Plain text when absent.
  links?: Record<string, string>;
}

// Donut plus legend, shared by the dashboard's Top emotions and both halves of
// the session summary, so every breakdown in the app reads the same way.
// Renders two siblings so the parent's flex row places them.
export function BreakdownDonut({
  slices,
  palette,
  links,
}: BreakdownDonutProps) {
  // Hovered slice shows in the center instead of a floating tooltip, which
  // covered the chart.
  const [hovered, setHovered] = useState<string | null>(null);
  const hex = palette === "sentiment" ? sentimentHex : emotionHex;
  const arcs = slices.filter((s) => s.value > 0);
  const largest = arcs.reduce<DonutSlice | undefined>(
    (top, s) => (!top || s.value > top.value ? s : top),
    undefined,
  );
  const center = arcs.find((s) => s.label === hovered) ?? largest;

  return (
    <>
      <div className="relative h-40 w-40 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={arcs}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={1}
              stroke="none"
              isAnimationActive={false}
              onMouseEnter={(_, index) =>
                setHovered(arcs[index]?.label ?? null)
              }
              onMouseLeave={() => setHovered(null)}
            >
              {arcs.map((d) => (
                <Cell
                  key={d.label}
                  fill={hex(d.label).bg}
                  fillOpacity={hovered && hovered !== d.label ? 0.4 : 1}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {center && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-gray-900">
              {center.value}%
            </span>
            <span
              className="text-xs font-medium capitalize"
              style={{ color: hex(center.label).text }}
            >
              {center.label}
            </span>
          </div>
        )}
      </div>
      {/* Fixed columns: dot, name, value. Values sit right after the names and
          line up down the list. */}
      <ul className="grid grid-cols-[0.625rem_5.5rem_2.5rem] items-center gap-x-3 gap-y-2">
        {slices.map((d) => (
          <li key={d.label} className="contents">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: hex(d.label).bg }}
            />
            {links?.[d.label] ? (
              <Link
                href={links[d.label]!}
                title="Show these lines in the transcript"
                className="text-sm capitalize text-gray-700 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 hover:decoration-gray-600"
              >
                {d.label}
              </Link>
            ) : (
              <span className="text-sm capitalize text-gray-700">
                {d.label}
              </span>
            )}
            <span className="text-right text-sm tabular-nums text-gray-500">
              {d.value}%
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
