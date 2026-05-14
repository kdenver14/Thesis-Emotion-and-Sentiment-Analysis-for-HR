"use server";

import bcrypt from "bcryptjs";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getManagerOrError } from "~/server/auth/guards";
import type { Role } from "~/types/roles";

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

  if (!data.name.trim()) return { error: "Name is required" };
  if (!data.email.trim()) return { error: "Email is required" };
  if (data.password.length < 8) return { error: "Password must be at least 8 characters" };

  const existing = await db.user.findUnique({ where: { email: data.email.trim() } });
  if (existing) return { error: "Email already in use" };

  const hashed = await bcrypt.hash(data.password, 12);
  await db.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.trim(),
      password: hashed,
      role: data.role,
      createdAt: new Date(),
    },
  });

  return {};
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: userId }, data: { password: hashed } });
  return {};
}

export async function removeUser(userId: string): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  if (guard.user.id === userId) return { error: "Cannot delete your own account" };
  await db.user.delete({ where: { id: userId } });
  return {};
}

export async function updateCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters" };
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
  if (!name.trim()) return { error: "Name is required" };
  await db.user.update({
    where: { id: guard.user.id },
    data: { name: name.trim() },
  });
  return {};
}

export async function updateUserName(
  userId: string,
  name: string,
): Promise<{ error?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  if (!name.trim()) return { error: "Name is required" };
  await db.user.update({
    where: { id: userId },
    data: { name: name.trim() },
  });
  return {};
}
