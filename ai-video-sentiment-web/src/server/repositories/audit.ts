import { db } from "~/server/db";

export const AUDIT_PAGE_SIZE = 50;

export interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string | null;
}

export interface AuditLogRow {
  id: string;
  createdAt: Date;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
}

const AUDIT_SELECT = {
  id: true,
  createdAt: true,
  actorId: true,
  actorName: true,
  action: true,
  targetType: true,
  targetId: true,
  targetName: true,
} as const;

// Paginated, newest first. Fetches one extra row to report hasMore without a
// second count query.
export async function getAuditLog(
  page: number,
): Promise<{ entries: AuditLogRow[]; hasMore: boolean }> {
  const skip = (page - 1) * AUDIT_PAGE_SIZE;
  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip,
    take: AUDIT_PAGE_SIZE + 1,
    select: AUDIT_SELECT,
  });
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  return { entries: hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows, hasMore };
}

// Append-only. Called after the mutation commits and outside a
// transaction, so this is a best-effort post-commit audit: a failed write
// throws and surfaces to the caller, but the mutation has already
// committed (a brief unlogged-change window exists). Wrap the mutation and
// this call in db.$transaction if strict atomic auditing is required.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: { ...entry, targetName: entry.targetName ?? null },
  });
}
