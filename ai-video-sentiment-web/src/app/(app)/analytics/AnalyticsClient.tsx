"use client";

import { useState } from "react";
import { FiActivity, FiTrendingUp, FiBarChart2, FiCalendar } from "react-icons/fi";
import { SentimentLineChart } from "~/components/client/charts/SentimentLineChart";
import { EmotionLineChart } from "~/components/client/charts/EmotionLineChart";
import { ExportButtons } from "~/components/client/ExportButtons";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import type { TrendPoint, EmotionTrendRow, SessionStats } from "~/server/repositories/session";

type Range = "7d" | "30d" | "90d";

const RANGE_OPTIONS: { key: Range; label: string; days: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
];

type TypeBreakdownItem = {
  sessionType: string;
  sentiments: Record<string, number>;
  emotions: Record<string, number>;
};

interface AnalyticsClientProps {
  trends7: TrendPoint[];
  trends30: TrendPoint[];
  trends90: TrendPoint[];
  emotionTrend: EmotionTrendRow[];
  typeBreakdown: TypeBreakdownItem[];
  stats: SessionStats;
}

function avg(arr: number[]) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="label-section">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

export function AnalyticsClient({
  trends7,
  trends30,
  trends90,
  emotionTrend,
  typeBreakdown,
  stats,
}: AnalyticsClientProps) {
  const [range, setRange] = useState<Range>("30d");

  const trendData = range === "7d" ? trends7 : range === "30d" ? trends30 : trends90;

  const avgEngagement = Math.round(avg(trendData.map((p) => p.avgEngagement)));
  const avgPositive = Math.round(avg(trendData.map((p) => p.positive)));
  const avgNegative = Math.round(avg(trendData.map((p) => p.negative)));
  const activeDays = trendData.length;

  const exportFrom = new Date(
    Date.now() - (range === "7d" ? 7 : range === "30d" ? 30 : 90) * 86400000,
  ).toISOString();

  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {stats.totalSessions} sessions recorded all-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Range pills */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === key
                    ? "bg-white text-slate-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ExportButtons aggregateParams={{ from: exportFrom }} label="Export" />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={FiCalendar}
          label="Active days"
          value={String(activeDays)}
          sub={`days with sessions in the last ${range}`}
        />
        <KpiCard
          icon={FiActivity}
          label="Avg engagement"
          value={trendData.length === 0 ? "—" : `${avgEngagement}`}
          sub="average score across period"
        />
        <KpiCard
          icon={FiTrendingUp}
          label="Positive rate"
          value={trendData.length === 0 ? "—" : `${avgPositive}%`}
          sub="avg positive sentiment"
        />
        <KpiCard
          icon={FiBarChart2}
          label="Negative rate"
          value={trendData.length === 0 ? "—" : `${avgNegative}%`}
          sub="avg negative sentiment"
        />
      </div>

      {/* Two-column: sentiment chart + type breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium text-gray-700">
            Sentiment trend — {range}
          </h2>
          <SentimentLineChart data={trendData} height={240} />
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-700">
            By session type
          </h2>
          {typeBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {typeBreakdown.map(({ sessionType, sentiments }) => {
                const label =
                  SESSION_TYPE_LABELS[
                    sessionType as keyof typeof SESSION_TYPE_LABELS
                  ] ?? sessionType.replace(/_/g, " ");
                const pos = sentiments["positive"] ?? 0;
                const neg = sentiments["negative"] ?? 0;
                const neu = sentiments["neutral"] ?? 0;
                return (
                  <div key={sessionType}>
                    <p className="mb-1.5 text-xs font-medium capitalize text-gray-600">
                      {label}
                    </p>
                    {/* Stacked bar */}
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="bg-green-500"
                        style={{ width: `${pos}%` }}
                      />
                      <div
                        className="bg-gray-300"
                        style={{ width: `${neu}%` }}
                      />
                      <div
                        className="bg-red-400"
                        style={{ width: `${neg}%` }}
                      />
                    </div>
                    <div className="mt-1 flex gap-3">
                      <span className="text-xs text-green-700">{pos}% positive</span>
                      <span className="text-xs text-gray-400">{neu}% neutral</span>
                      <span className="text-xs text-red-500">{neg}% negative</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Emotion trend — 30d full-width */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            Emotion trend — last 30 days
          </h2>
          <span className="text-xs text-gray-400">All 7 emotions</span>
        </div>
        <EmotionLineChart data={emotionTrend} height={260} />
      </div>
    </div>
  );
}
