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
  "employee.delete": "Deleted employee",
};

// Same wording as the User accounts page.
const ROLE_LABELS: Record<string, string> = {
  MANAGER: "HR Manager",
  DIRECTOR: "HR Director",
  STAFF: "HR Staff",
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
  const { entries, totalPages } = await getAuditLogPage(page);
  const hasMore = page < totalPages;

  const pageButton =
    "inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600";

  // Same table look as the Employees list: one bordered container, a light
  // header band, thin row dividers, paging only past one page.
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-8">
      {entries.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No changes recorded yet.
        </div>
      ) : (
        // Scrolls sideways inside the card on phones instead of squeezing columns.
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">Date and time</th>
                <th className="px-4 py-2 font-medium">Performed by</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Affected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    {auditDateFormatter.format(e.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900">{e.actorName}</div>
                    <div className="text-xs text-gray-500">
                      {e.actorRole ? (ROLE_LABELS[e.actorRole] ?? e.actorRole) : "Role not recorded"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {e.targetName ?? e.targetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 pt-1 text-xs">
          {page > 1 ? (
            <Link
              href={`/admin/audit?page=${page - 1}`}
              className={`${pageButton} hover:bg-gray-50`}
            >
              <FiChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Link>
          ) : (
            <span className={`${pageButton} opacity-40`} aria-disabled="true">
              <FiChevronLeft className="h-3.5 w-3.5" />
              Prev
            </span>
          )}
          <span className="tabular-nums text-gray-600">
            Page {page} of {totalPages}
          </span>
          {hasMore ? (
            <Link
              href={`/admin/audit?page=${page + 1}`}
              className={`${pageButton} hover:bg-gray-50`}
            >
              Next
              <FiChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className={`${pageButton} opacity-40`} aria-disabled="true">
              Next
              <FiChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
