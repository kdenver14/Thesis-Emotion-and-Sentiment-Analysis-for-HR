"use server";

import { auth } from "~/server/auth";
import {
  createEmployee,
  deleteEmployee,
  findEmployeesByUser,
  type EmployeeRow,
} from "~/server/repositories/employee";

async function getEffectiveEmployeeUserId(): Promise<string | null | undefined> {
  const session = await auth();
  if (!session?.user?.id) return undefined;
  return session.user.role === "STAFF" ? session.user.id : null;
}

export async function getEmployees(): Promise<EmployeeRow[]> {
  const userId = await getEffectiveEmployeeUserId();
  if (userId === undefined) return [];
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

  if (!data.name.trim()) return { error: "Name is required" };

  const employee = await createEmployee(session.user.id, {
    name: data.name.trim(),
    email: data.email?.trim() ?? undefined,
    department: data.department?.trim() ?? undefined,
    phone: data.phone?.trim() ?? undefined,
    status: data.status ?? "Active",
  });

  return { employee };
}

export async function removeEmployee(
  employeeId: string,
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR") return { error: "Directors cannot delete employee records" };

  await deleteEmployee(employeeId, session.user.id);
  return {};
}
