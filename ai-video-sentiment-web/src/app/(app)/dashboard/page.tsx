import { FiUsers } from "react-icons/fi";
import {
  getDashboardEmotionMetrics,
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
  const seesAllUsers = role !== "STAFF";
  const canMutate = role !== "DIRECTOR";

  const [emotionMetrics, sessions] = await Promise.all([
    getDashboardEmotionMetrics(),
    getSessions(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <ExportButtons aggregateParams={{}} label="Export all" userRole={role} />
      </div>

      {/* Emotion card */}
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

      {/* Latest session */}
      {sessions[0] && <LatestSessionCard session={sessions[0]} />}

      {/* Sessions table */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            Recent sessions
            {sessions.length > 0 && (
              <span className="ml-2 font-normal text-gray-400">
                · {sessions.length}
              </span>
            )}
          </h2>
        </div>
        <SessionTable sessions={sessions} seesAllUsers={seesAllUsers} canMutate={canMutate} />
      </div>
    </div>
  );
}
