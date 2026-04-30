"use server";

import { auth } from "~/server/auth";
import {
  createEmployee,
  deleteEmployee,
  findEmployeesByUser,
  type EmployeeRow,
} from "~/server/repositories/employee";

export async function getEmployees(): Promise<EmployeeRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return findEmployeesByUser(session.user.id);
}

export async function addEmployee(data: {
  name: string;
  email?: string;
  department?: string;
  role?: string;
  phone?: string;
  status?: string;
}): Promise<{ employee?: EmployeeRow; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };

  if (!data.name.trim()) return { error: "Name is required" };

  const employee = await createEmployee(session.user.id, {
    name: data.name.trim(),
    email: data.email?.trim() ?? undefined,
    department: data.department?.trim() ?? undefined,
    role: data.role?.trim() ?? undefined,
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

  await deleteEmployee(employeeId, session.user.id);
  return {};
}
