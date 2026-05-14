import "server-only";
import { auth } from "~/server/auth";
import type { Role } from "~/types/roles";

export type AuthedUser = { id: string; role: Role };

export async function currentUser(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role };
}

export async function requireManager(): Promise<AuthedUser> {
  const user = await currentUser();
  if (!user || user.role !== "MANAGER") throw new Error("Unauthorized");
  return user;
}

export async function requireMutator(): Promise<AuthedUser> {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  if (user.role === "DIRECTOR") throw new Error("Directors have view-only access");
  return user;
}

export async function effectiveScopeUserId(): Promise<string | null | undefined> {
  const user = await currentUser();
  if (!user) return undefined;
  return user.role === "STAFF" ? user.id : null;
}

export async function getManagerOrError(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.role !== "MANAGER") return { ok: false, error: "Unauthorized" };
  return { ok: true, user };
}
