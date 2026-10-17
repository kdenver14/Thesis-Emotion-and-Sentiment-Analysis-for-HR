"use server";

import { auth } from "~/server/auth";
import { getAuditLog, type AuditLogRow } from "~/server/repositories/audit";

// Managers and Directors only. STAFF never read the audit log (middleware also
// 404s /admin, but server actions are public RPC and must guard themselves).
export async function getAuditLogPage(
  page: number,
): Promise<{ entries: AuditLogRow[]; hasMore: boolean }> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") {
    return { entries: [], hasMore: false };
  }
  return getAuditLog(page);
}
