"use server";

import { revalidatePath } from "next/cache";
import { requireMutator, requireScopeUserId } from "~/server/auth/guards";
import {
  getSessionById,
  updateSessionEmployee,
  markCandidatePromoted,
  setCandidateRejected,
  clearCandidateRejection,
} from "~/server/repositories/session";
import { createEmployee } from "~/server/repositories/employee";

/**
 * Promotes an interview session's onboarding candidate to an Employee in one
 * step: creates the employee, auto-assigns this session to them, and records
 * the link so the action is idempotent across page reloads.
 */
export async function promoteCandidateToEmployee(
  sessionId: string,
): Promise<{ employeeId?: string; error?: string }> {
  const actor = await requireMutator();
  // requireMutator already rejected unauthenticated/DIRECTOR callers, so
  // this only narrows STAFF (own id) vs MANAGER (null = unrestricted).
  const scopeUserId = await requireScopeUserId();

  const session = await getSessionById(sessionId, scopeUserId);
  const candidate = session?.onboardingCandidate;
  if (!session || !candidate) {
    return { error: "This session has no interview candidate" };
  }
  if (candidate.promotedEmployeeId) {
    // Already promoted (e.g. a stale tab). Return the existing link instead
    // of creating a duplicate employee.
    return { employeeId: candidate.promotedEmployeeId };
  }
  if (candidate.rejectedAt) {
    return { error: "Undo the rejection first" };
  }

  const employee = await createEmployee(actor.id, {
    name: candidate.name,
    email: candidate.email ?? undefined,
    phone: candidate.phone ?? undefined,
    status: "Active",
  });

  await updateSessionEmployee(sessionId, scopeUserId, employee.id);
  await markCandidatePromoted(sessionId, scopeUserId, employee.id);

  revalidatePath(`/dashboard/${sessionId}`);
  return { employeeId: employee.id };
}

// Marks the interview candidate as rejected, starting the retention clock.
// The session is auto-deleted by the retention service once the window
// elapses. Fails if there is no candidate or it was already promoted.
export async function rejectCandidate(
  sessionId: string,
): Promise<{ error?: string }> {
  await requireMutator();
  const scopeUserId = await requireScopeUserId();

  const session = await getSessionById(sessionId, scopeUserId);
  const candidate = session?.onboardingCandidate;
  if (!session || !candidate) {
    return { error: "This session has no interview candidate" };
  }
  if (candidate.promotedEmployeeId) {
    return { error: "This candidate was already promoted to an employee" };
  }
  if (candidate.rejectedAt) {
    // Already rejected (e.g. a stale tab). No-op rather than resetting the clock.
    return {};
  }

  await setCandidateRejected(sessionId, scopeUserId, new Date());
  revalidatePath(`/dashboard/${sessionId}`);
  return {};
}

// Clears a rejection so HR can correct a mistake before the deletion date.
export async function undoCandidateRejection(
  sessionId: string,
): Promise<{ error?: string }> {
  await requireMutator();
  const scopeUserId = await requireScopeUserId();

  await clearCandidateRejection(sessionId, scopeUserId);
  revalidatePath(`/dashboard/${sessionId}`);
  return {};
}
