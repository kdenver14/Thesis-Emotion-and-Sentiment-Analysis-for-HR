import { db } from "~/server/db";

// About one laptop screen of rows, so "Next" shows up once the page is full.
export const AUDIT_PAGE_SIZE = 15;

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
  actorRole: string | null;
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
  actorRole: true,
  action: true,
  targetType: true,
  targetId: true,
  targetName: true,
} as const;

// Paginated, newest first, with the page count for "Page X of Y".
export async function getAuditLog(
  page: number,
): Promise<{ entries: AuditLogRow[]; totalPages: number }> {
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: AUDIT_SELECT,
    }),
    db.auditLog.count(),
  ]);
  return { entries, totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

// Display name snapshot of whoever performed an action.
export async function getActorName(id: string): Promise<string> {
  const u = await db.user.findUnique({ where: { id }, select: { name: true } });
  return u?.name ?? "(unknown)";
}

// Append-only. Called after the mutation commits and outside a
// transaction, so this is a best-effort post-commit audit: a failed write
// throws and surfaces to the caller, but the mutation has already
// committed (a brief unlogged-change window exists). Wrap the mutation and
// this call in db.$transaction if strict atomic auditing is required.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  // Role snapshot, like actorName: a later promotion must not rewrite history.
  const actor = await db.user.findUnique({
    where: { id: entry.actorId },
    select: { role: true },
  });
  await db.auditLog.create({
    data: {
      ...entry,
      targetName: entry.targetName ?? null,
      actorRole: actor?.role ?? null,
    },
  });
}
