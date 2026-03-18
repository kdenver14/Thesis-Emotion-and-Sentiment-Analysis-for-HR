import Link from "next/link";
import { FiGrid, FiTrendingUp, FiUsers, FiActivity } from "react-icons/fi";
import { getDashboardStats, getSessions, getSentimentTrends } from "~/actions/sessions";
import { getEmployees } from "~/actions/employees";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { SentimentLineChart } from "~/components/client/charts/SentimentLineChart";
import { ExportButtons } from "~/components/client/ExportButtons";

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

export default async function DashboardPage() {
  const [stats, sessions, trends, employees] = await Promise.all([
    getDashboardStats(),
    getSessions(),
    getSentimentTrends(30),
    getEmployees(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <ExportButtons aggregateParams={{}} label="Export all" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiGrid className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Sessions</span>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats.totalSessions}
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiActivity className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Avg Engagement</span>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats.avgEngagementScore}
            <span className="text-sm font-normal text-gray-500">/100</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiTrendingUp className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Positive rate</span>
          </div>
          <div className="text-2xl font-semibold text-green-600">
            {stats.sentimentBreakdown.positive}
            <span className="text-sm font-normal text-gray-500">%</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiUsers className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Top emotion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">
              {EMOTION_EMOJI[stats.mostCommonEmotion] ?? ""}
            </span>
            <span className="text-sm capitalize text-gray-600">
              {stats.mostCommonEmotion}
            </span>
          </div>
        </div>
      </div>

      {/* Sentiment trend chart */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Sentiment trend (last 30 days)
        </h2>
        <SentimentLineChart data={trends} />
      </div>

      {/* Sessions table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Recent sessions</h2>
          <Link
            href="/analytics"
            className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
          >
            View analytics →
          </Link>
        </div>
        <SessionTable sessions={sessions} employees={employees} />
      </div>
    </div>
  );
}
