import Link from "next/link";
import {
  FiGrid,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiUsers,
  FiActivity,
  FiAlertTriangle,
  FiUserX,
  FiCalendar,
} from "react-icons/fi";
import {
  getDashboardStats,
  getSessions,
  getSentimentTrends,
} from "~/actions/sessions";
import { getEmployees } from "~/actions/employees";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { SentimentLineChart } from "~/components/client/charts/SentimentLineChart";
import { ExportButtons } from "~/components/client/ExportButtons";
import { ScoreBadge } from "~/components/ui/ScoreBadge";
import type { TrendPoint } from "~/server/repositories/session";

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

function trendDelta(trends: TrendPoint[], key: keyof Omit<TrendPoint, "date">) {
  if (trends.length < 2) return null;
  const mid = Math.floor(trends.length / 2);
  const avg = (slice: TrendPoint[]) =>
    slice.reduce((s, p) => s + (p[key] as number), 0) / slice.length;
  return Math.round(avg(trends.slice(mid)) - avg(trends.slice(0, mid)));
}

function TrendIndicator({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta > 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-green-600">
        <FiTrendingUp className="h-3 w-3" />+{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-500">
        <FiTrendingDown className="h-3 w-3" />
        {delta}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-xs text-gray-400">
      <FiMinus className="h-3 w-3" />0
    </span>
  );
}

export default async function DashboardPage() {
  const [stats, sessions, trends, employees] = await Promise.all([
    getDashboardStats(),
    getSessions(),
    getSentimentTrends(30),
    getEmployees(),
  ]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const unassigned = sessions.filter((s) => !s.employeeId);
  const flagged = sessions.filter((s) => s.engagementScore < 40);
  const thisWeek = sessions.filter((s) => s.sessionDate >= sevenDaysAgo);

  const topSessions = [...sessions]
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 5);

  const engagementDelta = trendDelta(trends, "avgEngagement");
  const positiveDelta = trendDelta(trends, "positive");

  const PRIORITY_CARDS = [
    {
      icon: FiUserX,
      count: unassigned.length,
      label: "Unassigned",
      description: "sessions without a candidate linked",
      href: "/dashboard",
    },
    {
      icon: FiAlertTriangle,
      count: flagged.length,
      label: "Low Engagement",
      description: "sessions scored below 40",
      href: "/dashboard",
    },
    {
      icon: FiCalendar,
      count: thisWeek.length,
      label: "This Week",
      description: "sessions recorded in the last 7 days",
      href: "/dashboard",
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <ExportButtons aggregateParams={{}} label="Export all" />
      </div>

      {/* Priority tray */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PRIORITY_CARDS.map(({ icon: Icon, count, label, description, href }) => (
          <Link
            key={label}
            href={href}
            className={`card flex items-center gap-4 p-4 transition-colors hover:bg-gray-50 ${
              count > 0 ? "card-alert" : ""
            }`}
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                count > 0
                  ? "bg-amber-100 text-amber-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-bold ${count > 0 ? "text-amber-600" : "text-gray-400"}`}
                >
                  {count}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {label}
                </span>
              </div>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiGrid className="h-4 w-4" />
            <span className="label-section">Sessions</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {stats.totalSessions}
          </div>
          <p className="text-xs text-gray-400">total all-time</p>
        </div>

        <div className="card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiActivity className="h-4 w-4" />
            <span className="label-section">Avg Engagement</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">
              {stats.avgEngagementScore}
            </span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
          <TrendIndicator delta={engagementDelta} />
        </div>

        <div className="card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiTrendingUp className="h-4 w-4" />
            <span className="label-section">Positive rate</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-green-700">
              {stats.sentimentBreakdown.positive}
            </span>
            <span className="text-sm text-gray-400">%</span>
          </div>
          <TrendIndicator delta={positiveDelta} />
        </div>

        <div className="card flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiUsers className="h-4 w-4" />
            <span className="label-section">Top emotion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">
              {EMOTION_EMOJI[stats.mostCommonEmotion] ?? ""}
            </span>
            <span className="text-sm capitalize text-gray-600">
              {stats.mostCommonEmotion}
            </span>
          </div>
          <p className="text-xs text-gray-400">most frequent</p>
        </div>
      </div>

      {/* Chart + top sessions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium text-gray-700">
            Sentiment trend — last 30 days
          </h2>
          <SentimentLineChart data={trends} />
        </div>

        <div className="card flex flex-col gap-1 p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            Top sessions
          </h2>
          {topSessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {topSessions.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 shrink-0 text-xs font-semibold text-gray-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/${s.id}`}
                      className="block truncate text-sm font-medium text-gray-800 hover:text-slate-700 hover:underline"
                    >
                      {s.title}
                    </Link>
                    {s.employee && (
                      <p className="truncate text-xs text-gray-400">
                        {s.employee.name}
                      </p>
                    )}
                  </div>
                  <ScoreBadge score={s.engagementScore} />
                </li>
              ))}
            </ul>
          )}
          {sessions.length > 5 && (
            <Link
              href="/analytics"
              className="mt-2 text-xs text-gray-400 hover:text-gray-700 hover:underline"
            >
              View all analytics →
            </Link>
          )}
        </div>
      </div>

      {/* Sessions table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            Recent sessions
          </h2>
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
