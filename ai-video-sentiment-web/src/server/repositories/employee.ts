import { db } from "~/server/db";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
}

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  phone: true,
  status: true,
  createdAt: true,
} as const;

export async function findEmployeesByUser(
  userId: string | null,
): Promise<EmployeeRow[]> {
  return db.employee.findMany({
    where: userId
      ? { userId, status: { not: "Deleted" } }
      : { status: { not: "Deleted" } },
    select: EMPLOYEE_SELECT,
    orderBy: { name: "asc" },
  });
}

export async function findEmployeeById(
  employeeId: string,
  userId: string | null,
): Promise<EmployeeRow | null> {
  return db.employee.findFirst({
    where: userId ? { id: employeeId, userId } : { id: employeeId },
    select: EMPLOYEE_SELECT,
  });
}

export async function createEmployee(
  userId: string,
  data: { name: string; email?: string; department?: string; role?: string; phone?: string; status?: string },
): Promise<EmployeeRow> {
  return db.employee.create({
    data: { userId, ...data },
    select: EMPLOYEE_SELECT,
  });
}

export async function deleteEmployee(
  employeeId: string,
  userId: string,
): Promise<void> {
  await db.employee.updateMany({
    where: { id: employeeId, userId },
    data: { status: "Deleted" },
  });
}
