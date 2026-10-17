"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getManagerOrError } from "~/server/auth/guards";
import { recordAudit } from "~/server/repositories/audit";
import { revokeAllForUser } from "~/server/repositories/trustedDevice";
import {
  sendVerificationEmail,
  sendPasswordChangeCode,
  verifyPasswordChangeCode,
} from "~/server/services/verification";
import type { Role } from "~/types/roles";

// Server actions are wire RPC: the TS arg type is erased at runtime, so
// `role` MUST be runtime-validated or a caller can escalate to MANAGER.
// 72 = bcrypt's hard input ceiling (bytes beyond are silently dropped).
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt hard ceiling
const MAX_NAME = 200;

function passwordError(pw: string): string | null {
  if (pw.length < MIN_PASSWORD)
    return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > MAX_PASSWORD)
    return `Password must be ${MAX_PASSWORD} characters or fewer`;
  return null;
}

// Snapshot the actor's display name for the audit trail at write time
// (bare id + name, no FK) so the log survives the actor being deleted.
async function actorName(id: string): Promise<string> {
  const u = await db.user.findUnique({
    where: { id },
    select: { name: true },
  });
  return u?.name ?? "(unknown)";
}

// Demo mailbox constraint, enforced in code (not just procedure): every user
// address must be a plus-addressed alias of the single verification inbox so
// real strangers can never be emailed. scripts/create-admin.ts bypasses this
// schema and auto-verifies, so admin bootstrap is unaffected.
const DEMO_EMAIL = /^blastasia\.hr\.app\+[a-z0-9.]{1,40}@gmail\.com$/;

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email")
    .max(254)
    .regex(
      DEMO_EMAIL,
      "Email must be blastasia.hr.app+<name>@gmail.com (demo mailbox)",
    ),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["STAFF", "DIRECTOR"]),
});

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  createdAt: Date | null;
};

export async function getUsers(): Promise<UserRow[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") return [];
  const rows = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: "STAFF" | "DIRECTOR";
}): Promise<{ error?: string; warning?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };

  const parsed = createUserSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, password, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "Email already in use" };

  const hashed = await bcrypt.hash(password, 12);
  const created = await db.user.create({
    data: { name, email, password: hashed, role, createdAt: new Date() },
    select: { id: true },
  });

  await recordAudit({
    actorId: guard.user.id,
    actorName: await actorName(guard.user.id),
    action: "user.create",
    targetType: "user",
    targetId: created.id,
    targetName: email,
  });

  // Best-effort: a mail failure must not roll back an already-created
  // account, but the admin is told so they can use the resend flow.
  try {
    await sendVerificationEmail(created.id);
  } catch {
    return {
      warning:
        "Account created, but the verification email failed to send. Ask the user to use 'Resend verification'.",
    };
  }
  return {};
}

export async function removeUser(userId: string): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  if (guard.user.id === userId) return { error: "Cannot delete your own account" };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      name: true,
      _count: { select: { employees: true } },
    },
  });
  if (!target) return { error: "User not found" };
  // Server actions are public RPC; the UI hiding the delete button for
  // MANAGERs is not enforcement. Reject admin-target deletion server-side
  // (also makes locking out the last admin impossible).
  if (target.role === "MANAGER") {
    return { error: "Cannot delete an admin account" };
  }
  // Employee.user is onDelete: Cascade, so deleting an owner
  // cascade-destroys their HR records (including soft-deleted ones).
  // Force explicit reassignment instead of silent data loss.
  if (target._count.employees > 0) {
    return {
      error: "Reassign this user's employee records before deleting the account",
    };
  }

  await db.user.delete({ where: { id: userId } });
  await recordAudit({
    actorId: guard.user.id,
    actorName: await actorName(guard.user.id),
    action: "user.delete",
    targetType: "user",
    targetId: userId,
    targetName: target.name,
  });
  return {};
}

// Step 1: re-check the current password, then email a 6-digit step-up code.
// Verifying the current password here means a hijacked session cannot spam
// codes and the user's identity is confirmed before any mail is sent.
export async function requestPasswordChangeCode(
  currentPassword: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.password) return { error: "Account does not use password login" };

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return { error: "Current password is incorrect" };

  const result = await sendPasswordChangeCode(session.user.id);
  return result.ok ? {} : { error: result.error };
}

// Step 2: re-validate everything server-side (the step-up code is not the only
// gate) and apply the new password.
export async function updateCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
  code: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  const pwErr = passwordError(newPassword);
  if (pwErr) return { error: pwErr };
  if (newPassword === currentPassword) return { error: "New password must differ from current" };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.password) return { error: "Account does not use password login" };

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return { error: "Current password is incorrect" };

  // Reject malformed input before it burns one of the 5 attempts (stale
  // autofill / buggy client must not self-DoS the user's quota).
  if (!/^\d{6}$/.test(code)) return { error: "Incorrect code." };

  const codeResult = await verifyPasswordChangeCode(session.user.id, code);
  if (codeResult !== "ok") {
    return {
      error:
        codeResult === "expired"
          ? "Code expired. Request a new one."
          : codeResult === "locked"
            ? "Too many incorrect attempts. Request a new code."
            : "Incorrect code.",
    };
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: session.user.id }, data: { password: hashed } });
  // Rotating the password evicts every remembered device so a stale trusted
  // cookie cannot keep skipping 2FA after a credential change.
  await revokeAllForUser(session.user.id);
  await recordAudit({
    actorId: session.user.id,
    actorName: await actorName(session.user.id),
    action: "user.password_changed",
    targetType: "user",
    targetId: session.user.id,
    targetName: user.name,
  });
  return {};
}

export async function updateCurrentUserName(
  name: string,
): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: "Only an admin can change your name" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (trimmed.length > MAX_NAME)
    return { error: `Name must be ${MAX_NAME} characters or fewer` };
  await db.user.update({
    where: { id: guard.user.id },
    data: { name: trimmed },
  });
  await recordAudit({
    actorId: guard.user.id,
    actorName: await actorName(guard.user.id),
    action: "user.rename",
    targetType: "user",
    targetId: guard.user.id,
    targetName: trimmed,
  });
  return {};
}

export async function updateUserName(
  userId: string,
  name: string,
): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required" };
  if (trimmed.length > MAX_NAME)
    return { error: `Name must be ${MAX_NAME} characters or fewer` };
  await db.user.update({
    where: { id: userId },
    data: { name: trimmed },
  });
  await recordAudit({
    actorId: guard.user.id,
    actorName: await actorName(guard.user.id),
    action: "user.rename",
    targetType: "user",
    targetId: userId,
    targetName: trimmed,
  });
  return {};
}
