import {
  getDashboardEmotionMetrics,
  getEmotionTrend,
  getSessions,
} from "~/actions/sessions";
import type { EmotionTrendRow } from "~/server/repositories/session";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { LatestSessionCard } from "~/components/client/LatestSessionCard";
import { ExportButtons } from "~/components/client/ExportButtons";
import { EmotionPanel } from "~/components/client/charts/EmotionPanel";
import { allowedWindows, hasTrendAccess } from "~/lib/trend";
import { auth } from "~/server/auth";

export default async function DashboardPage() {
  const session = await auth();
  const role = session?.user?.role ?? "STAFF";
  const seesAllUsers = role !== "STAFF";
  const canMutate = role !== "DIRECTOR";

  const showTrend = hasTrendAccess(role);
  const windows = allowedWindows(role);
  const trendDays = windows[0] ?? 30;

  const [emotionMetrics, trend, sessions] = await Promise.all([
    getDashboardEmotionMetrics(),
    showTrend
      ? getEmotionTrend(trendDays)
      : Promise.resolve<EmotionTrendRow[]>([]),
    getSessions(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-end">
        <ExportButtons aggregateParams={{}} label="Export all" userRole={role} />
      </div>

      {/* Emotion bars + emotion trend, driven by shared switch; latest
          session fills the left column under the bars card */}
      <EmotionPanel
        metrics={emotionMetrics}
        trend={trend}
        windows={windows}
        initialDays={trendDays}
        showTrend={showTrend}
        latestSession={
          sessions[0] ? <LatestSessionCard session={sessions[0]} /> : null
        }
      />

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
