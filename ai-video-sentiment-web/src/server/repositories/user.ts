import { db } from "~/server/db";
import { asRole, type Role } from "~/types/roles";

// True while the user still has the temporary password an admin's account
// creation emailed them (see setOwnPassword).
export async function getMustChangePassword(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { mustChangePassword: true },
  });
  return user?.mustChangePassword ?? false;
}

export type AccountState = {
  role: Role;
  archived: boolean;
  // Login cookies issued before this time are no longer valid.
  sessionsRevokedAt: Date | null;
};

// Read on every request so role changes and archiving apply at once, not at
// the user's next sign-in. Null when the account no longer exists.
export async function getAccountState(
  userId: string,
): Promise<AccountState | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, archivedAt: true, sessionsRevokedAt: true },
  });
  return user
    ? {
        role: asRole(user.role),
        archived: user.archivedAt !== null,
        sessionsRevokedAt: user.sessionsRevokedAt,
      }
    : null;
}

export type UserAdminView = {
  name: string | null;
  role: Role;
  archived: boolean;
};

export async function getUserAdminView(
  userId: string,
): Promise<UserAdminView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true, archivedAt: true },
  });
  return user
    ? {
        name: user.name,
        role: asRole(user.role),
        archived: user.archivedAt !== null,
      }
    : null;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

// There is only ever one active HR Director; archived ones do not count.
async function directorTaken(tx: Tx, exceptUserId?: string): Promise<boolean> {
  const count = await tx.user.count({
    where: {
      role: "DIRECTOR",
      archivedAt: null,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
  });
  return count > 0;
}

// The checks below run in the same transaction as their write, so two
// Managers acting at once cannot both pass them; on SQLite the second write
// fails with a busy error instead.

export type NewUser = {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
};

export async function createUserIfDirectorFree(
  data: NewUser,
): Promise<{ id: string } | "director_taken"> {
  return db.$transaction(async (tx) => {
    if (data.role === "DIRECTOR" && (await directorTaken(tx))) {
      return "director_taken" as const;
    }
    return tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: data.passwordHash,
        role: data.role,
        createdAt: new Date(),
        mustChangePassword: true,
      },
      select: { id: true },
    });
  });
}

// Archiving also revokes every login cookie issued so far.
export async function archiveUserRecord(userId: string): Promise<void> {
  const now = new Date();
  await db.user.update({
    where: { id: userId },
    data: { archivedAt: now, sessionsRevokedAt: now },
  });
}

export async function restoreUserRecord(
  userId: string,
): Promise<"ok" | "director_taken"> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === "DIRECTOR" && (await directorTaken(tx, userId))) {
      return "director_taken" as const;
    }
    await tx.user.update({ where: { id: userId }, data: { archivedAt: null } });
    return "ok" as const;
  });
}

// The actor is re-read inside the transaction: two Managers demoting each
// other at the same moment cannot leave zero Managers.
export async function changeRoleRecord(
  actorId: string,
  userId: string,
  role: Role,
): Promise<"ok" | "director_taken" | "actor_not_manager"> {
  return db.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, archivedAt: true },
    });
    if (actor?.role !== "MANAGER" || actor.archivedAt) {
      return "actor_not_manager" as const;
    }
    if (role === "DIRECTOR" && (await directorTaken(tx, userId))) {
      return "director_taken" as const;
    }
    await tx.user.update({ where: { id: userId }, data: { role } });
    return "ok" as const;
  });
}

export async function getEmailStatus(
  email: string,
): Promise<"free" | "taken" | "archived"> {
  const user = await db.user.findUnique({
    where: { email },
    select: { archivedAt: true },
  });
  if (!user) return "free";
  return user.archivedAt ? "archived" : "taken";
}
