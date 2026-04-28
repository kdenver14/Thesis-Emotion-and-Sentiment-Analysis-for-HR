import Navigation from "~/components/client/Navigation";
import { Inference } from "~/components/client/Inference";
import { getEmployees } from "~/actions/employees";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const [employees, session] = await Promise.all([getEmployees(), auth()]);
  const interviewerName = session?.user?.name ?? "";

  return (
    <div className="min-h-screen bg-white">
      <Navigation userName={interviewerName} />
      <main className="flex min-h-screen w-full flex-col items-center gap-6 p-4 sm:p-10">
        <Inference employees={employees} interviewerName={interviewerName} />
      </main>
    </div>
  );
}
