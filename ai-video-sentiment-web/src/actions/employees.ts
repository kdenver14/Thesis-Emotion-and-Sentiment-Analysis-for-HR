"use server";

import { auth } from "~/server/auth";
import {
  createEmployee,
  findEmployeesByUser,
  setEmployeeArchived,
  updateEmployeeName,
  type EmployeeRow,
} from "~/server/repositories/employee";
import { getActorName, recordAudit } from "~/server/repositories/audit";
import { addEmployeeSchema } from "~/schemas/employee";
import { getAccessScope } from "~/server/auth/guards";

const MAX_EMPLOYEE_NAME = 200;

// Employees are one shared directory: every role sees, and every non-Director
// edits, all of them (user decision 2026-11-07). Sessions stay owner-scoped.
export async function getEmployees(): Promise<EmployeeRow[]> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return [];
  return findEmployeesByUser(null);
}

// Shown on the Employees page only; pickers never offer archived employees.
export async function getArchivedEmployees(): Promise<EmployeeRow[]> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return [];
  return findEmployeesByUser(null, true);
}

export async function addEmployee(data: {
  name: string;
  email?: string;
  department?: string;
  phone?: string;
}): Promise<{ employee?: EmployeeRow; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR")
    return { error: "Directors cannot create employee records" };

  const parsed = addEmployeeSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const employee = await createEmployee(session.user.id, {
    name: v.name,
    email: v.email,
    department: v.department,
    phone: v.phone,
    status: "Active",
  });

  return { employee };
}

export async function renameEmployee(
  employeeId: string,
  name: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (session.user.role === "DIRECTOR")
    throw new Error("Directors cannot edit employee records");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Employee name is required");
  if (trimmed.length > MAX_EMPLOYEE_NAME)
    throw new Error(
      `Employee name must be ${MAX_EMPLOYEE_NAME} characters or fewer`,
    );
  await updateEmployeeName(employeeId, null, trimmed);
}

// Archive replaces delete: the employee leaves the lists and pickers, their
// sessions stay linked, and restoring brings them back.
async function setArchived(
  employeeId: string,
  archived: boolean,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR")
    return { error: "Directors have view-only access" };

  const name = await setEmployeeArchived(employeeId, null, archived);
  if (name === null) {
    return {
      error: archived
        ? "Employee not found or already archived"
        : "Employee not found or not archived",
    };
  }
  await recordAudit({
    actorId: session.user.id,
    actorName: await getActorName(session.user.id),
    action: archived ? "employee.archive" : "employee.restore",
    targetType: "employee",
    targetId: employeeId,
    targetName: name,
  });
  return {};
}

export async function archiveEmployee(
  employeeId: string,
): Promise<{ error?: string }> {
  return setArchived(employeeId, true);
}

export async function restoreEmployee(
  employeeId: string,
): Promise<{ error?: string }> {
  return setArchived(employeeId, false);
}
