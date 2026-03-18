"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { Score } from "~/types/analysis";

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  disgust: "#a855f7",
  fear: "#f97316",
  joy: "#22c55e",
  neutral: "#6b7280",
  sadness: "#3b82f6",
  surprise: "#eab308",
};

interface EmotionBarChartProps {
  data: Score[];
  height?: number;
}

export function EmotionBarChart({ data, height = 220 }: EmotionBarChartProps) {
  const chartData = data
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .map((s) => ({
      label: s.label,
      value: parseFloat((s.confidence * 100).toFixed(1)),
    }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => [`${String(v)}%`, "Score"]} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chartData.map((entry) => (
            <Cell
              key={entry.label}
              fill={EMOTION_COLORS[entry.label] ?? "#6b7280"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
