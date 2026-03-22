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
import type { TrendPoint } from "~/server/repositories/session";

const SENTIMENT_CONFIG = [
  { key: "positive", color: "#22c55e", label: "Positive" },
  { key: "neutral", color: "#6b7280", label: "Neutral" },
  { key: "negative", color: "#ef4444", label: "Negative" },
] as const;

interface SentimentLineChartProps {
  data: TrendPoint[];
  height?: number;
}

export function SentimentLineChart({
  data,
  height = 240,
}: SentimentLineChartProps) {
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {SENTIMENT_CONFIG.map(({ key, color }) => (
            <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => `${String(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SENTIMENT_CONFIG.map(({ key, color, label }) => (
          <Area
            key={key}
            type="natural"
            dataKey={key}
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
            name={label}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
