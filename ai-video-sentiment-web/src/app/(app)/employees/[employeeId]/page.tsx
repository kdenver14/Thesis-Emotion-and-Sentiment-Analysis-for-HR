import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import { auth } from "~/server/auth";
import { findEmployeeById } from "~/server/repositories/employee";
import { getSessionsByUser, getEmotionTrendsOverTime } from "~/server/repositories/session";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { SentimentLineChart } from "~/components/client/charts/SentimentLineChart";
import { DeleteEmployeeButton } from "./DeleteEmployeeButton";

interface PageProps {
  params: Promise<{ employeeId: string }>;
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { employeeId } = await params;
  const authSession = await auth();
  if (!authSession?.user?.id) notFound();

  const userId = authSession.user.isAdmin ? null : authSession.user.id;
  const [employee, allSessions, trends] = await Promise.all([
    findEmployeeById(employeeId, userId),
    getSessionsByUser(userId, { employeeId }),
    getEmotionTrendsOverTime(userId, 90, employeeId),
  ]);

  if (!employee) notFound();

  const employeeTrendData = trends;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/employees"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
        >
          <FiArrowLeft className="h-3 w-3" /> Back to Employees
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">
                {employee.name}
              </h1>
              <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                {employee.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
              {employee.role && <span>{employee.role}</span>}
              {employee.department && <span>{employee.department}</span>}
              {employee.email && <span>{employee.email}</span>}
              {employee.phone && <span>{employee.phone}</span>}
            </div>
          </div>
          <DeleteEmployeeButton employeeId={employeeId} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Sessions
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {allSessions.length}
          </div>
        </div>
        {allSessions.length > 0 && (
          <>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Avg engagement
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">
                {Math.round(
                  allSessions.reduce((a, s) => a + s.engagementScore, 0) /
                    allSessions.length,
                )}
                <span className="text-sm font-normal text-gray-500">/100</span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Top sentiment
              </div>
              <div className="mt-1 text-lg font-semibold capitalize text-gray-900">
                {(() => {
                  const counts: Record<string, number> = {};
                  for (const s of allSessions) {
                    counts[s.topSentiment] = (counts[s.topSentiment] ?? 0) + 1;
                  }
                  return (
                    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
                    "—"
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Trend chart */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Sentiment trend (90 days)
        </h2>
        <SentimentLineChart data={employeeTrendData} height={200} />
      </div>

      {/* Sessions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700">Sessions</h2>
        <SessionTable sessions={allSessions} isAdmin={authSession.user.isAdmin ?? false} />
      </div>
    </div>
  );
}
