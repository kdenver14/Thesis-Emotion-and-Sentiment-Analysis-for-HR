import Navigation from "~/components/client/Navigation";
import { JobStatusBar } from "~/components/client/JobStatusBar";
import { JobsProvider } from "~/context/JobsContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <JobsProvider>
      <div className="min-h-screen bg-white">
        <Navigation />
        <JobStatusBar />
        <main>{children}</main>
      </div>
    </JobsProvider>
  );
}
