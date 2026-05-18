"use server";

import { revalidatePath } from "next/cache";
import { requireMutator, requireScopeUserId } from "~/server/auth/guards";
import {
  getSessionById,
  updateSessionEmployee,
  markCandidatePromoted,
} from "~/server/repositories/session";
import { createEmployee } from "~/server/repositories/employee";
import { addEmployeeSchema } from "~/schemas/employee";

const ageOnlySchema = addEmployeeSchema.pick({ age: true });
const genderOnlySchema = addEmployeeSchema.pick({ gender: true });

/**
 * Promotes an interview session's onboarding candidate to an Employee in one
 * step: creates the employee, auto-assigns this session to them, and records
 * the link so the action is idempotent across page reloads.
 *
 * Candidate demographics are free-form. Age / gender are only carried over
 * when each independently satisfies the employee constraints; invalid values
 * are dropped (HR fills them via the demographics editor) rather than failing
 * the whole promotion.
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

  const age = ageOnlySchema.safeParse({ age: candidate.age ?? undefined });
  const gender = genderOnlySchema.safeParse({
    gender: candidate.gender ?? undefined,
  });

  const employee = await createEmployee(actor.id, {
    name: candidate.name,
    email: candidate.email ?? undefined,
    phone: candidate.phone ?? undefined,
    age: age.success ? age.data.age : undefined,
    gender: gender.success ? gender.data.gender : undefined,
    status: "Active",
  });

  await updateSessionEmployee(sessionId, scopeUserId, employee.id);
  await markCandidatePromoted(sessionId, scopeUserId, employee.id);

  revalidatePath(`/dashboard/${sessionId}`);
  return { employeeId: employee.id };
}
