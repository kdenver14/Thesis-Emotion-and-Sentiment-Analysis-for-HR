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

  return (
    <div className="min-h-screen bg-white">
      <Navigation userName={interviewerName} />
      <main className="flex min-h-screen w-full flex-col items-center gap-6 p-4 sm:p-10">
        <Inference employees={employees} interviewerName={interviewerName} />
        <RecentSessionsList sessions={sessions.slice(0, 5)} />
      </main>
    </div>
  );
}
