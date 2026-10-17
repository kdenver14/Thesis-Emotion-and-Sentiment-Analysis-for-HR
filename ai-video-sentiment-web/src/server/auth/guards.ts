import "server-only";
import { auth } from "~/server/auth";
import type { Role } from "~/types/roles";

export type AuthedUser = { id: string; role: Role };

export async function currentUser(): Promise<AuthedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role };
}

// Guard conventions, by call site:
//  - require*()  -> throws on failure. Use in fire-and-forget mutations
//    where a thrown error is the correct outcome and cannot be ignored.
//  - get*OrError() -> returns a result union. Use in form-bound actions
//    that render the error inline to the user.
// Do not mix both within one action.

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

// Row-ownership scope. STAFF see only their own rows; MANAGER/DIRECTOR
// are unrestricted. Discriminated so the unauthenticated case can never
// silently collapse into "see all" the way a `string | null | undefined`
// return value can when a caller writes `userId ? scoped : unscoped`.
export type AccessScope =
  | { kind: "unauthenticated" }
  | { kind: "all" }
  | { kind: "own"; userId: string };

export async function getAccessScope(): Promise<AccessScope> {
  const user = await currentUser();
  if (!user) return { kind: "unauthenticated" };
  return user.role === "STAFF"
    ? { kind: "own", userId: user.id }
    : { kind: "all" };
}

// Mutation-path scope: throws on unauthenticated (the unauth case must
// not reach a repository), returns the repo-boundary userId (own id for
// STAFF, null/unrestricted for MANAGER/DIRECTOR).
export async function requireScopeUserId(): Promise<string | null> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") throw new Error("Unauthorized");
  return scope.kind === "own" ? scope.userId : null;
}

export async function getManagerOrError(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.role !== "MANAGER") return { ok: false, error: "Unauthorized" };
  return { ok: true, user };
}

// Result-union counterpart of requireMutator(), for form-bound actions that
// render the error inline. DIRECTOR is view-only.
export async function getMutatorOrError(): Promise<
  { ok: true; user: AuthedUser } | { ok: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Unauthorized" };
  if (user.role === "DIRECTOR")
    return { ok: false, error: "Directors have view-only access" };
  return { ok: true, user };
}
