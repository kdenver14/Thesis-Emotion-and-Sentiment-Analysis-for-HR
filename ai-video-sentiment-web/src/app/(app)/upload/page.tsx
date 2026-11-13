import { redirect } from "next/navigation";
import { Inference } from "~/components/client/Inference";
import { getEmployees } from "~/actions/employees";
import { auth } from "~/server/auth";

export default async function UploadPage() {
  const [employees, session] = await Promise.all([getEmployees(), auth()]);
  // Directors are view-only. Checked here, not in middleware: only Node
  // reads the current role (see the jwt callback).
  if (session?.user?.role === "DIRECTOR") redirect("/dashboard");
  const interviewerName = session?.user?.name ?? "";

  return (
    <div className="flex w-full flex-col items-center gap-6 p-4 sm:p-10">
      <Inference employees={employees} interviewerName={interviewerName} />
    </div>
  );
}
