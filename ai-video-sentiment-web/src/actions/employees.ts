"use server";

import { auth } from "~/server/auth";
import {
  createEmployee,
  deleteEmployee,
  findEmployeesByUser,
  updateEmployeeName,
  type EmployeeRow,
} from "~/server/repositories/employee";
import { addEmployeeSchema } from "~/schemas/employee";
import { getAccessScope, requireScopeUserId } from "~/server/auth/guards";

const MAX_EMPLOYEE_NAME = 200;

export async function getEmployees(): Promise<EmployeeRow[]> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return [];
  const userId = scope.kind === "own" ? scope.userId : null;
  return findEmployeesByUser(userId);
}

export async function addEmployee(data: {
  name: string;
  email?: string;
  department?: string;
  phone?: string;
  status?: string;
}): Promise<{ employee?: EmployeeRow; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR") return { error: "Directors cannot create employee records" };

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
    status: v.status ?? "Active",
  });

  return { employee };
}

export async function renameEmployee(
  employeeId: string,
  name: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (session.user.role === "DIRECTOR") throw new Error("Directors cannot edit employee records");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Employee name is required");
  if (trimmed.length > MAX_EMPLOYEE_NAME)
    throw new Error(
      `Employee name must be ${MAX_EMPLOYEE_NAME} characters or fewer`,
    );
  const userId = await requireScopeUserId();
  await updateEmployeeName(employeeId, userId, trimmed);
}

export async function removeEmployee(
  employeeId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR") return { error: "Directors cannot delete employee records" };

  const userId = await requireScopeUserId();
  await deleteEmployee(employeeId, userId);
  return {};
}
