"use server";

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { getManagerOrError } from "~/server/auth/guards";
import { getActorName, recordAudit } from "~/server/repositories/audit";
import { revokeAllForUser } from "~/server/repositories/trustedDevice";
import {
  archiveUserRecord,
  changeRoleRecord,
  createUserIfDirectorFree,
  getEmailStatus,
  getUserAdminView,
  restoreUserRecord,
} from "~/server/repositories/user";
import {
  sendVerificationEmail,
  sendPasswordChangeCode,
  verifyPasswordChangeCode,
} from "~/server/services/verification";
import { ROLE_LABELS, type Role } from "~/types/roles";
import { passwordSchema, userNameSchema } from "~/schemas/auth";
import { DEMO_EMAIL_MESSAGE, DEMO_EMAIL_PATTERN } from "~/lib/demoEmail";

// Server actions are wire RPC: the TS arg type is erased at runtime, so
// `role` MUST be runtime-validated or a caller can escalate to MANAGER.
// 72 = bcrypt's hard input ceiling (bytes beyond are silently dropped).
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt hard ceiling

function passwordError(pw: string): string | null {
  if (pw.length < MIN_PASSWORD)
    return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > MAX_PASSWORD)
    return `Password must be ${MAX_PASSWORD} characters or fewer`;
  return null;
}

const ONE_DIRECTOR_ERROR =
  "There is already an HR Director. Change their role or archive them first.";

const roleSchema = z.enum(["STAFF", "MANAGER", "DIRECTOR"]);

const createUserSchema = z.object({
  name: userNameSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email")
    .max(254)
    .regex(DEMO_EMAIL_PATTERN, DEMO_EMAIL_MESSAGE),
  role: z.enum(["STAFF", "DIRECTOR"]),
});

// Temporary password for a new account, emailed to the user and never shown
// to the admin. No look-alike characters (0/O, 1/l/I), so it is easy to type
// from the email; 12 of 56 symbols is about 70 bits.
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TEMP_PASSWORD_LENGTH = 12;

function generateTempPassword(): string {
  return Array.from({ length: TEMP_PASSWORD_LENGTH }, () =>
    TEMP_PASSWORD_ALPHABET.charAt(randomInt(TEMP_PASSWORD_ALPHABET.length)),
  ).join("");
}

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  createdAt: Date | null;
  // Sessions this user uploaded, any status: the dashboard's "Handled by".
  sessionsHandled: number;
  archived: boolean;
};

export async function getUsers(): Promise<UserRow[]> {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") return [];
  const rows = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      archivedAt: true,
      _count: { select: { analysisSessions: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map(({ _count, archivedAt, ...r }) => ({
    ...r,
    role: r.role as Role,
    sessionsHandled: _count.analysisSessions,
    archived: archivedAt !== null,
  }));
}

export async function createUser(data: {
  name: string;
  email: string;
  role: "STAFF" | "DIRECTOR";
}): Promise<{ error?: string; warning?: string }> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };

  const parsed = createUserSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, role } = parsed.data;

  const emailStatus = await getEmailStatus(email);
  if (emailStatus === "archived") {
    return {
      error:
        "This email belongs to an archived account. Use 'Show archived accounts' at the bottom of the list to restore it.",
    };
  }
  if (emailStatus === "taken") return { error: "Email already in use" };

  const tempPassword = generateTempPassword();
  const created = await createUserIfDirectorFree({
    name,
    email,
    role,
    passwordHash: await bcrypt.hash(tempPassword, 12),
  });
  if (created === "director_taken") return { error: ONE_DIRECTOR_ERROR };

  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
    action: "user.create",
    targetType: "user",
    targetId: created.id,
    targetName: email,
  });

  // Best-effort: a mail failure must not roll back an already-created
  // account. The temporary password is then lost on purpose (never shown to
  // the admin), so the user recovers through the login page links.
  try {
    await sendVerificationEmail(created.id, tempPassword);
  } catch (err) {
    console.warn("createUser: welcome email failed", err);
    // Forgot password works for unverified accounts; signing in with the new
    // password then offers a fresh verification email.
    return {
      warning:
        "Account created, but the email with the temporary password failed to send. Ask the user to use 'Forgot password' on the sign-in page.",
    };
  }
  return {};
}

// First sign-in after an admin created the account: replace the emailed
// temporary password with the user's own. The sign-in itself already passed
// the emailed 2FA code, so no extra code is asked here.
export async function setOwnPassword(
  newPassword: string,
): Promise<{ error?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "Unauthorized" };

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, password: true, mustChangePassword: true },
  });
  if (!user) return { error: "Unauthorized" };
  if (!user.mustChangePassword)
    return { error: "Your password is already set" };
  if (await bcrypt.compare(parsed.data, user.password)) {
    return { error: "Choose a password different from the temporary one" };
  }

  await db.user.update({
    where: { id: userId },
    data: {
      password: await bcrypt.hash(parsed.data, 12),
      mustChangePassword: false,
    },
  });
  // Same rule as every other password change: evict remembered devices.
  await revokeAllForUser(userId);
  await recordAudit({
    actorId: userId,
    actorName: await getActorName(userId),
    action: "user.password_changed",
    targetType: "user",
    targetId: userId,
    targetName: user.name,
  });
  return {};
}

type ActionResult = { error?: string };

// Archiving replaces deleting: the account can no longer sign in (any open
// session ends on its next request), while its sessions, the employees it
// added and every "Handled by" name stay. Restore undoes it.
export async function archiveUser(userId: string): Promise<ActionResult> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  if (guard.user.id === userId)
    return { error: "You cannot archive your own account" };

  const target = await getUserAdminView(userId);
  if (!target) return { error: "User not found" };
  if (target.archived) return { error: "Account is already archived" };
  // Server actions are public RPC; hiding the menu item is not enforcement.
  if (target.role === "MANAGER") {
    return { error: "Change this HR Manager's role before archiving them" };
  }

  await archiveUserRecord(userId);
  // A remembered device must not skip the code if the account is restored.
  await revokeAllForUser(userId);
  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
    action: "user.archive",
    targetType: "user",
    targetId: userId,
    targetName: target.name,
  });
  return {};
}

export async function restoreUser(userId: string): Promise<ActionResult> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };

  const target = await getUserAdminView(userId);
  if (!target) return { error: "User not found" };
  if (!target.archived) return { error: "Account is not archived" };
  if ((await restoreUserRecord(userId)) === "director_taken") {
    return { error: ONE_DIRECTOR_ERROR };
  }
  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
    action: "user.restore",
    targetType: "user",
    targetId: userId,
    targetName: target.name,
  });
  return {};
}

// Promotion or demotion keeps the account and all of its data. Takes effect
// on the user's next request (the jwt callback re-reads the role).
export async function changeUserRole(
  userId: string,
  role: string,
): Promise<ActionResult> {
  const guard = await getManagerOrError();
  if (!guard.ok) return { error: guard.error };
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { error: "Invalid role" };
  const newRole = parsed.data;
  // Only Managers get here (re-checked inside the write) and none can change
  // their own role, so at least one HR Manager always remains.
  if (guard.user.id === userId)
    return { error: "You cannot change your own role" };

  const target = await getUserAdminView(userId);
  if (!target) return { error: "User not found" };
  if (target.archived) return { error: "Restore this account first" };
  if (target.role === newRole) return {};
  const result = await changeRoleRecord(guard.user.id, userId, newRole);
  if (result === "director_taken") return { error: ONE_DIRECTOR_ERROR };
  if (result === "actor_not_manager") return { error: "Unauthorized" };
  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
    action: "user.role_change",
    targetType: "user",
    targetId: userId,
    targetName: `${target.name ?? "(no name)"} (now ${ROLE_LABELS[newRole]})`,
  });
  return {};
}

// Step 1: re-check the current password, then email a 6-digit step-up code.
// Verifying the current password here means a hijacked session cannot spam
// codes and the user's identity is confirmed before any mail is sent.
export async function requestPasswordChangeCode(
  currentPassword: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.password) return { error: "Account does not use password login" };

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) return { error: "Current password is incorrect" };
  // Before the email, not after the code: a password that will be refused
  // must not cost the user a code first. updateCurrentUserPassword re-checks.
  const parsedNew = passwordSchema.safeParse(newPassword);
  if (!parsedNew.success)
    return { error: parsedNew.error.issues[0]?.message ?? "Invalid password" };
  if (newPassword === currentPassword)
    return { error: "New password must differ from current" };

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
  if (newPassword === currentPassword)
    return { error: "New password must differ from current" };

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
  await db.user.update({
    where: { id: session.user.id },
    data: { password: hashed, mustChangePassword: false },
  });
  // Rotating the password evicts every remembered device so a stale trusted
  // cookie cannot keep skipping 2FA after a credential change.
  await revokeAllForUser(session.user.id);
  await recordAudit({
    actorId: session.user.id,
    actorName: await getActorName(session.user.id),
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
  const parsed = userNameSchema.safeParse(name);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  const trimmed = parsed.data;
  await db.user.update({
    where: { id: guard.user.id },
    data: { name: trimmed },
  });
  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
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
  const parsed = userNameSchema.safeParse(name);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  const trimmed = parsed.data;
  await db.user.update({
    where: { id: userId },
    data: { name: trimmed },
  });
  await recordAudit({
    actorId: guard.user.id,
    actorName: await getActorName(guard.user.id),
    action: "user.rename",
    targetType: "user",
    targetId: userId,
    targetName: trimmed,
  });
  return {};
}
