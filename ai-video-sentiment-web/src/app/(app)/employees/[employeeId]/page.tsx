import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import { auth } from "~/server/auth";
import { findEmployeeById } from "~/server/repositories/employee";
import { getSessionsByUser } from "~/server/repositories/session";
import { renameEmployee } from "~/actions/employees";
import { InlineTitle } from "~/components/client/InlineTitle";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { getSentimentBreakdown } from "~/types/analysis";
import {
  NEGATIVE_CLASS,
  NEUTRAL_CLASS,
  POSITIVE_CLASS,
  emotionColorClass,
} from "~/lib/sentiment";
import { DeleteEmployeeButton } from "./DeleteEmployeeButton";
import { EditDemographics } from "./EditDemographics";

interface PageProps {
  params: Promise<{ employeeId: string }>;
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { employeeId } = await params;
  const authSession = await auth();
  if (!authSession?.user?.id) notFound();

  const canMutate = authSession.user.role !== "DIRECTOR";
  const seesAllUsers = authSession.user.role !== "STAFF";
  const userId = authSession.user.role === "STAFF" ? authSession.user.id : null;
  const [employee, allSessions] = await Promise.all([
    findEmployeeById(employeeId, userId),
    getSessionsByUser(userId, { employeeId }),
  ]);

  if (!employee) notFound();

  const completedSessions = allSessions.filter((s) => s.status === "COMPLETED");
  const avgSentimentBreakdown =
    completedSessions.length > 0
      ? (() => {
          const totals = completedSessions.reduce(
            (acc, s) => {
              const b = getSentimentBreakdown(s.avgSentiments);
              acc.positive += b.positive;
              acc.neutral += b.neutral;
              acc.negative += b.negative;
              return acc;
            },
            { positive: 0, neutral: 0, negative: 0 },
          );
          const n = completedSessions.length;
          return {
            positive: Math.round(totals.positive / n),
            neutral: Math.round(totals.neutral / n),
            negative: Math.round(totals.negative / n),
          };
        })()
      : null;

  const avgExpressivenessPct =
    completedSessions.length > 0
      ? Math.round(
          completedSessions.reduce((a, s) => a + s.expressivenessPct, 0) /
            completedSessions.length,
        )
      : null;

  const expressiveCounts: Record<string, number> = {};
  for (const s of completedSessions) {
    if (s.expressivenessPct > 0) {
      expressiveCounts[s.topExpressiveEmotion] =
        (expressiveCounts[s.topExpressiveEmotion] ?? 0) + 1;
    }
  }
  const topExpressiveEmotion =
    Object.entries(expressiveCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

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
              {canMutate ? (
                <InlineTitle
                  initialValue={employee.name}
                  save={renameEmployee.bind(null, employeeId)}
                  className="text-xl font-semibold text-gray-900"
                />
              ) : (
                <h1 className="text-xl font-semibold text-gray-900">
                  {employee.name}
                </h1>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
              {employee.department && <span>{employee.department}</span>}
              {employee.email && <span>{employee.email}</span>}
              {employee.phone && <span>{employee.phone}</span>}
              {canMutate ? (
                <EditDemographics
                  employeeId={employeeId}
                  age={employee.age}
                  gender={employee.gender}
                />
              ) : (
                <>
                  {employee.age !== null && <span>{employee.age} yrs</span>}
                  {employee.gender && <span>{employee.gender}</span>}
                </>
              )}
              <span>Added {employee.createdAt.toLocaleDateString("en-GB")}</span>
              {seesAllUsers && employee.addedBy && (
                <span>Added by {employee.addedBy.name ?? "—"}</span>
              )}
            </div>
          </div>
          {canMutate && <DeleteEmployeeButton employeeId={employeeId} />}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-stretch divide-x divide-gray-200 rounded-xl border border-gray-200">
        <div className="flex flex-col px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Sessions
          </span>
          <span className="mt-0.5 text-lg font-semibold text-gray-900">
            {allSessions.length}
          </span>
        </div>
        <div className="flex flex-col px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Avg sentiment
          </span>
          <span className="mt-0.5 text-sm font-medium text-gray-900">
            {avgSentimentBreakdown ? (
              <>
                <span className={POSITIVE_CLASS}>
                  {avgSentimentBreakdown.positive}% pos
                </span>
                <span className="text-gray-400"> · </span>
                <span className={NEUTRAL_CLASS}>
                  {avgSentimentBreakdown.neutral}% neu
                </span>
                <span className="text-gray-400"> · </span>
                <span className={NEGATIVE_CLASS}>
                  {avgSentimentBreakdown.negative}% neg
                </span>
              </>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </span>
        </div>
        <div className="flex flex-col px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-gray-400">
            Avg expressiveness
          </span>
          <span className="mt-0.5 text-sm font-medium text-gray-900">
            {avgExpressivenessPct !== null ? (
              <>
                {avgExpressivenessPct}%
                {topExpressiveEmotion && (
                  <span className="font-normal text-gray-500">
                    {" · "}top:{" "}
                    <span
                      className={`capitalize ${emotionColorClass(topExpressiveEmotion)}`}
                    >
                      {topExpressiveEmotion}
                    </span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-300">—</span>
            )}
          </span>
        </div>
      </div>

      {/* Sessions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700">Sessions</h2>
        <SessionTable sessions={allSessions} seesAllUsers={authSession.user.role !== "STAFF"} canMutate={canMutate} />
      </div>
    </div>
  );
}
