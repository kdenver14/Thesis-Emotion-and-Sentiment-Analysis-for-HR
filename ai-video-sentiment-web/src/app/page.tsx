import Navigation from "~/components/client/Navigation";
import { Inference } from "~/components/client/Inference";
import { RecentSessionsList } from "~/components/client/RecentSessionsList";
import { getEmployees } from "~/actions/employees";
import { getSessions } from "~/actions/sessions";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const [employees, sessions, session] = await Promise.all([
    getEmployees(),
    getSessions(),
    auth(),
  ]);
  const interviewerName = session?.user?.name ?? "";
  const role = session?.user?.role ?? "STAFF";
  const seesAllUsers = role !== "STAFF";
  const canUpload = role !== "DIRECTOR";

  return (
    <div className="min-h-screen bg-white">
      <Navigation userName={interviewerName} userRole={role} />
      <main className="flex min-h-screen w-full flex-col items-center gap-6 p-4 sm:p-10">
        {canUpload ? (
          <Inference employees={employees} interviewerName={interviewerName} />
        ) : (
          <div className="flex w-full max-w-2xl items-center justify-center rounded-xl border border-dashed border-gray-200 p-10 text-sm text-gray-400">
            Directors have view-only access. Contact a manager to upload sessions.
          </div>
        )}
        <RecentSessionsList sessions={sessions.slice(0, 5)} seesAllUsers={seesAllUsers} />
      </main>
    </div>
  );
}
