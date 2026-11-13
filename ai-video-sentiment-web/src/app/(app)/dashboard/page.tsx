import Link from "next/link";
import { FiUpload } from "react-icons/fi";
import {
  getDashboardEmotionMetrics,
  getEmotionTrend,
  getSessions,
} from "~/actions/sessions";
import type { EmotionTrendRow } from "~/server/repositories/session";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { SessionTypeFilter } from "~/components/client/charts/SessionTypeFilter";
import { ExportButtons } from "~/components/client/ExportButtons";
import { EmotionPanel } from "~/components/client/charts/EmotionPanel";
import { DashboardStats } from "~/components/DashboardStats";
import { MonthCompareButton } from "~/components/client/MonthCompareButton";
import { ProcessingPoller } from "~/components/client/ProcessingPoller";
import { getMonthComparison } from "~/actions/reports";
import { allowedWindows, hasTrendAccess } from "~/lib/trend";
import { auth } from "~/server/auth";
import { SESSION_TYPES } from "~/types/analysis";

// Longest analysis seen is about 80 minutes; 6 hours leaves a wide margin.
const WATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

// The `?type=` URL param lets the type filter in SessionTable drive the
// emotion bars and trend chart too. The server validates it against the
// allow-list; a garbage value is dropped and the dashboard renders as if
// no filter were set (safeType stays undefined → unfiltered queries).
function resolveTypeParam(
  raw: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  return (SESSION_TYPES as readonly string[]).includes(value)
    ? value
    : undefined;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? "STAFF";
  const seesAllUsers = role !== "STAFF";
  const canMutate = role !== "DIRECTOR";

  const showTrend = hasTrendAccess(role);
  const windows = allowedWindows(role);
  const trendDays = windows[0] ?? 30;

  const params = await searchParams;
  const typeFilter = resolveTypeParam(params.type);

  const [emotionMetrics, trend, sessions, monthComparison] = await Promise.all([
    getDashboardEmotionMetrics(typeFilter),
    showTrend
      ? getEmotionTrend(trendDays, typeFilter)
      : Promise.resolve<EmotionTrendRow[]>([]),
    getSessions(),
    // HR Managers only (null otherwise); the Director has the Reports tab.
    getMonthComparison(typeFilter),
  ]);

  const total = sessions.length;
  // An unfinished session older than this is stuck (abandoned upload, lost
  // result) and would otherwise be polled for as long as the page is open.
  const watchSince = Date.now() - WATCH_WINDOW_MS;
  const inProgress = sessions.filter(
    (s) =>
      (s.status === "PROCESSING" || s.status === "UPLOADING") &&
      s.createdAt.getTime() > watchSince,
  );
  // Only offer types that actually exist in the visible sessions.
  const typeOptions = [...new Set(sessions.map((s) => s.sessionType))].sort();

  if (total === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 py-20 text-center">
          <p className="text-sm font-medium text-gray-600">No sessions yet</p>
          <p className="max-w-sm text-xs text-gray-400">
            {canMutate
              ? "Upload a video to run your first sentiment analysis."
              : "Analyzed sessions will appear here once they are uploaded."}
          </p>
          {canMutate && (
            <Link
              href="/upload"
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700"
            >
              <FiUpload className="h-4 w-4" />
              Upload a video
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      {/* Each unfinished session is watched, so its row and the figures
          update without a manual reload.
          shortcut: one status request per watched session; batch them into
          one query if many videos are ever analysed at once. */}
      {inProgress.map((s) => (
        <ProcessingPoller key={s.id} sessionId={s.id} status={s.status} />
      ))}
      {/* Emotion overview. Its toolbar also carries the export actions, so the
          page shows one control row instead of a title bar plus a second row. */}
      <EmotionPanel
        metrics={emotionMetrics}
        trend={trend}
        windows={windows}
        initialDays={trendDays}
        showTrend={showTrend}
        sessionType={typeFilter}
        summary={
          <DashboardStats
            sessionCount={emotionMetrics.sessionCount}
            lineCount={emotionMetrics.allEmotions.total}
            sentiment={emotionMetrics.sentiment}
            expressive={emotionMetrics.expressive}
          />
        }
        actions={
          <>
            <SessionTypeFilter
              value={typeFilter ?? "all"}
              options={typeOptions}
            />
            {monthComparison && (
              <MonthCompareButton
                data={monthComparison}
                typeFilter={typeFilter}
              />
            )}
            <ExportButtons
              aggregateParams={{}}
              label="Export all"
              userRole={role}
            />
          </>
        }
      />

      {/* Sessions table */}
      <div className="flex flex-col gap-3">
        <SessionTable
          sessions={sessions}
          seesAllUsers={seesAllUsers}
          canMutate={canMutate}
          typeFilter={typeFilter ?? "all"}
        />
      </div>
    </div>
  );
}
