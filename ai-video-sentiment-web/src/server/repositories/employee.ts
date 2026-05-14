import { db } from "~/server/db";

export interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  addedBy: { id: string; name: string | null } | null;
}

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  phone: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

type RawEmployee = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  phone: string | null;
  status: string;
  createdAt: Date;
  user: { id: string; name: string | null } | null;
};

function toEmployeeRow(r: RawEmployee): EmployeeRow {
  const { user, ...rest } = r;
  return { ...rest, addedBy: user };
}

export async function findEmployeesByUser(
  userId: string | null,
): Promise<EmployeeRow[]> {
  const rows = await db.employee.findMany({
    where: userId
      ? { userId, status: { not: "Deleted" } }
      : { status: { not: "Deleted" } },
    select: EMPLOYEE_SELECT,
    orderBy: { name: "asc" },
  });
  return rows.map(toEmployeeRow);
}

export async function findEmployeeById(
  employeeId: string,
  userId: string | null,
): Promise<EmployeeRow | null> {
  const row = await db.employee.findFirst({
    where: userId ? { id: employeeId, userId } : { id: employeeId },
    select: EMPLOYEE_SELECT,
  });
  return row ? toEmployeeRow(row) : null;
}

export async function createEmployee(
  userId: string,
  data: { name: string; email?: string; department?: string; role?: string; phone?: string; status?: string },
): Promise<EmployeeRow> {
  const row = await db.employee.create({
    data: { userId, ...data },
    select: EMPLOYEE_SELECT,
  });
  return toEmployeeRow(row);
}

export async function updateEmployeeName(
  employeeId: string,
  userId: string | null,
  name: string,
): Promise<void> {
  await db.employee.updateMany({
    where: userId ? { id: employeeId, userId } : { id: employeeId },
    data: { name },
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
