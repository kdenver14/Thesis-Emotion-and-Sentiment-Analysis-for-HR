"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type MonthCompareDatum = {
  metric: string;
  previous: number;
  current: number;
};

export function MonthCompareChart({
  data,
  previousLabel,
  currentLabel,
  previousFill,
  currentFill,
}: {
  data: MonthCompareDatum[];
  previousLabel: string;
  currentLabel: string;
  previousFill: string;
  currentFill: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* Hidden from screen readers (a table carries the numbers), so the
          chart must not take keyboard focus either. */}
      <BarChart
        accessibilityLayer={false}
        data={data}
        margin={{ top: 20, right: 8, bottom: 0, left: -16 }}
        barGap={2}
      >
        <CartesianGrid stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="metric"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          tickLine={false}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          cursor={{ fill: "#f9fafb" }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
          }}
          formatter={(value) => `${String(value)}%`}
        />
        <Bar
          dataKey="previous"
          name={previousLabel}
          fill={previousFill}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        >
          <LabelList
            dataKey="previous"
            position="top"
            formatter={(v) => `${String(v)}%`}
            style={{ fontSize: 11, fill: "#6b7280" }}
          />
        </Bar>
        <Bar
          dataKey="current"
          name={currentLabel}
          fill={currentFill}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        >
          <LabelList
            dataKey="current"
            position="top"
            formatter={(v) => `${String(v)}%`}
            style={{ fontSize: 11, fill: "#374151" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
