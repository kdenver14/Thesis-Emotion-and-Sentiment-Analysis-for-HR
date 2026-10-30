import { Inference } from "~/components/client/Inference";
import { getEmployees } from "~/actions/employees";
import { auth } from "~/server/auth";

export default async function UploadPage() {
  const [employees, session] = await Promise.all([getEmployees(), auth()]);
  const interviewerName = session?.user?.name ?? "";
  const role = session?.user?.role ?? "STAFF";
  const canUpload = role !== "DIRECTOR";

  return (
    <div className="flex w-full flex-col items-center gap-6 p-4 sm:p-10">
      {canUpload ? (
        <Inference employees={employees} interviewerName={interviewerName} />
      ) : (
        <div className="flex w-full max-w-2xl items-center justify-center rounded-xl border border-dashed border-gray-200 p-10 text-sm text-gray-400">
          Directors have view-only access. Contact a manager to upload sessions.
        </div>
      )}
    </div>
  );
}
