"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getManagerOrError } from "~/server/auth/guards";
import { recordAudit } from "~/server/repositories/audit";
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

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Invalid email").max(254),
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
}): Promise<{ error?: string }> {
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

export async function updateCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
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

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: session.user.id }, data: { password: hashed } });
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
