import Navigation from "~/components/client/Navigation";
import { Inference } from "~/components/client/Inference";
import { JobsProvider } from "~/context/JobsContext";
import { JobStatusBar } from "~/components/client/JobStatusBar";
import { getEmployees } from "~/actions/employees";

export default async function HomePage() {
  const employees = await getEmployees();

  return (
    <JobsProvider>
      <div className="min-h-screen bg-white">
        <Navigation />
        <JobStatusBar />
        <main className="flex min-h-screen w-full flex-col items-center gap-6 p-4 sm:p-10">
          <Inference employees={employees} />
        </main>
      </div>
    </JobsProvider>
  );
}
