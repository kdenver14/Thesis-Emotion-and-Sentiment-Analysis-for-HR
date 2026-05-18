import { db } from "~/server/db";

export interface AuditEntry {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string | null;
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
