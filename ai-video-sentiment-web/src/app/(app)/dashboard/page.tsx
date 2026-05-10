import { FiGrid, FiUsers } from "react-icons/fi";
import {
  getDashboardEmotionMetrics,
  getDashboardStats,
  getSessions,
} from "~/actions/sessions";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { LatestSessionCard } from "~/components/client/LatestSessionCard";
import { ExportButtons } from "~/components/client/ExportButtons";
import { ExpressiveToggle } from "~/components/client/ExpressiveToggle";
import { auth } from "~/server/auth";

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "STAFF";
  const isAdmin = role !== "STAFF";
  const canMutate = role !== "DIRECTOR";

  const [stats, emotionMetrics, sessions] = await Promise.all([
    getDashboardStats(),
    getDashboardEmotionMetrics(),
    getSessions(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <ExportButtons aggregateParams={{}} label="Export all" userRole={role} />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiGrid className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Sessions</span>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {stats.totalSessions}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-400">
            <FiUsers className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide">Emotion</span>
          </div>
          <ExpressiveToggle
            expressive={emotionMetrics.expressive}
            allEmotions={emotionMetrics.allEmotions}
            totalLabel="utterances analyzed"
            size="lg"
          />
        </div>
      </div>

      {/* Latest session */}
      {sessions[0] && <LatestSessionCard session={sessions[0]} />}

      {/* Sessions table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Recent sessions</h2>
        </div>
        <SessionTable sessions={sessions} isAdmin={isAdmin} canMutate={canMutate} />
      </div>
    </div>
  );
}
