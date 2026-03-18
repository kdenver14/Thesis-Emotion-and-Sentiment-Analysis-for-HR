"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "~/server/repositories/session";

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
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => `${String(v)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="positive"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Positive"
        />
        <Line
          type="monotone"
          dataKey="neutral"
          stroke="#6b7280"
          strokeWidth={2}
          dot={false}
          name="Neutral"
        />
        <Line
          type="monotone"
          dataKey="negative"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="Negative"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
