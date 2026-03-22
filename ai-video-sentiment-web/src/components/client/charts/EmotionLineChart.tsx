"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { EmotionTrendRow } from "~/server/repositories/session";
import { EMOTION_LABELS } from "~/types/analysis";

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  disgust: "#a855f7",
  fear: "#f97316",
  joy: "#22c55e",
  neutral: "#6b7280",
  sadness: "#3b82f6",
  surprise: "#eab308",
};

interface EmotionLineChartProps {
  data: EmotionTrendRow[];
  height?: number;
}

export function EmotionLineChart({ data, height = 240 }: EmotionLineChartProps) {
  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-gray-400"
      >
        No data for this period
      </div>
    );
  }

  const flat = data.map((row) => ({ date: row.date, ...row.emotions }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={flat} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {EMOTION_LABELS.map((emotion) => (
            <linearGradient key={emotion} id={`gradient-${emotion}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EMOTION_COLORS[emotion]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={EMOTION_COLORS[emotion]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => `${String(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {EMOTION_LABELS.map((emotion) => (
          <Area
            key={emotion}
            type="natural"
            dataKey={emotion}
            stroke={EMOTION_COLORS[emotion]}
            strokeWidth={2}
            fill={`url(#gradient-${emotion})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
            name={emotion.charAt(0).toUpperCase() + emotion.slice(1)}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
