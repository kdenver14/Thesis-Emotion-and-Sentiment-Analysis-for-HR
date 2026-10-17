import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { auth } from "~/server/auth";
import { getAuditLogPage } from "~/actions/audit";

// Match DASHBOARD_TZ in src/server/repositories/session.ts.
const AUDIT_TZ = "Asia/Manila";
const auditDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: AUDIT_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const ACTION_LABELS: Record<string, string> = {
  "user.create": "Created account",
  "user.delete": "Deleted account",
  "user.rename": "Renamed account",
  "user.password_changed": "Changed password",
  "user.password_reset": "Reset password",
  "user.email_verified": "Verified email",
};

const pageParamSchema = z.coerce.number().int().min(1).catch(1);

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") notFound();

  const params = await searchParams;
  const page = pageParamSchema.parse(params.page);
  const { entries, hasMore } = await getAuditLogPage(page);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
        <span className="text-sm text-gray-400">Page {page}</span>
      </div>

      {entries.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No account changes recorded yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-medium">Date and time</th>
                <th className="px-4 py-3 font-medium">Performed by</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Account affected</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {auditDateFormatter.format(e.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{e.actorName}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {e.targetName ?? e.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link
            href={`/admin/audit?page=${page - 1}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            <FiChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Link>
        ) : (
          <span />
        )}
        {hasMore ? (
          <Link
            href={`/admin/audit?page=${page + 1}`}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            Next
            <FiChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
