import { db } from "~/server/db";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  createdAt: Date;
}

export async function findEmployeesByUser(
  userId: string,
): Promise<EmployeeRow[]> {
  return db.employee.findMany({
    where: { userId },
    select: { id: true, name: true, email: true, department: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export async function findEmployeeById(
  employeeId: string,
  userId: string,
): Promise<EmployeeRow | null> {
  return db.employee.findFirst({
    where: { id: employeeId, userId },
    select: { id: true, name: true, email: true, department: true, createdAt: true },
  });
}

export async function createEmployee(
  userId: string,
  data: { name: string; email?: string; department?: string },
): Promise<EmployeeRow> {
  return db.employee.create({
    data: { userId, ...data },
    select: { id: true, name: true, email: true, department: true, createdAt: true },
  });
}

export async function deleteEmployee(
  employeeId: string,
  userId: string,
): Promise<void> {
  await db.employee.deleteMany({ where: { id: employeeId, userId } });
}
