import { notFound } from "next/navigation";
import Link from "next/link";
import {
  FiArrowLeft,
  FiBriefcase,
  FiCalendar,
  FiMail,
  FiPhone,
  FiUserPlus,
} from "react-icons/fi";
import { auth } from "~/server/auth";
import { findEmployeeById } from "~/server/repositories/employee";
import {
  getSessionsByUser,
  type ParsedSession,
} from "~/server/repositories/session";
import { renameEmployee } from "~/actions/employees";
import { InlineTitle } from "~/components/client/InlineTitle";
import { SessionSummary } from "~/components/client/SessionSummary";
import { SessionTable } from "~/components/client/charts/SessionTable";
import { Fact } from "~/components/Fact";
import {
  averageShares,
  distributePercents,
  getSentimentBreakdown,
  toPercentSlices,
} from "~/types/analysis";
import { DeleteEmployeeButton } from "./DeleteEmployeeButton";

interface PageProps {
  params: Promise<{ employeeId: string }>;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

// Average tone across sessions (each weighted equally) as integer percents
// that sum to 100, the shape the summary card's sentiment donut takes.
function averageSentiment(sessions: ParsedSession[]) {
  const totals = [0, 0, 0];
  for (const s of sessions) {
    const b = getSentimentBreakdown(s.avgSentiments);
    totals[0]! += b.positive;
    totals[1]! += b.neutral;
    totals[2]! += b.negative;
  }
  const [positive = 0, neutral = 0, negative = 0] = distributePercents(totals);
  return { positive, neutral, negative };
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  const { employeeId } = await params;
  const authSession = await auth();
  if (!authSession?.user?.id) notFound();

  const canMutate = authSession.user.role !== "DIRECTOR";
  // The employee is shared across roles; its sessions stay owner-scoped.
  const userId = authSession.user.role === "STAFF" ? authSession.user.id : null;
  const [employee, allSessions] = await Promise.all([
    findEmployeeById(employeeId, null),
    getSessionsByUser(userId, { employeeId }),
  ]);

  if (!employee) notFound();

  const completed = allSessions.filter((s) => s.status === "COMPLETED");
  const expressive = completed
    .map((s) => s.expressiveEmotions)
    .filter((e) => e.length > 0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      {/* Header: same layout as a session page. */}
      <div className="flex flex-col gap-3">
        <Link
          href="/employees"
          className="flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
        >
          <FiArrowLeft className="h-3 w-3" /> Back to Employees
        </Link>
        {/* Only a trash icon on the right, so it fits beside the name even on phones. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
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
          {canMutate && <DeleteEmployeeButton employeeId={employeeId} />}
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {employee.department && (
            <Fact icon={FiBriefcase} label="Department">
              {employee.department}
            </Fact>
          )}
          {employee.email && (
            <Fact icon={FiMail} label="Email">
              {employee.email}
            </Fact>
          )}
          {employee.phone && (
            <Fact icon={FiPhone} label="Phone">
              {employee.phone}
            </Fact>
          )}
          <Fact icon={FiCalendar} label="Added on">
            {employee.createdAt.toLocaleDateString("en-GB")}
          </Fact>
          {employee.addedBy && (
            <Fact icon={FiUserPlus} label="Added by">
              {employee.addedBy.name ?? "—"}
            </Fact>
          )}
        </dl>
      </div>

      {/* Same two-donut card as a session, averaged over this person's
          analysed sessions. */}
      {completed.length > 0 ? (
        <SessionSummary
          title="Employee Summary"
          sentiment={averageSentiment(completed)}
          sentimentDescription={`Average tone across ${plural(completed.length, "session")}`}
          emotionSlices={toPercentSlices(averageShares(expressive))}
          emotionsDescription={`Non-neutral utterances, averaged across ${plural(expressive.length, "session")}`}
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No analysed sessions yet.
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-900">Sessions</h2>
        <SessionTable
          sessions={allSessions}
          seesAllUsers={authSession.user.role !== "STAFF"}
          canMutate={canMutate}
          hideEmployee
        />
      </section>
    </div>
  );
}
