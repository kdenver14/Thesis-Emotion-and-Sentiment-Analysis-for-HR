import { db } from "~/server/db";
import { ARCHIVED_STATUS } from "~/schemas/employee";

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

// Active employees by default; `archived` lists only the archived ones.
export async function findEmployeesByUser(
  userId: string | null,
  archived = false,
): Promise<EmployeeRow[]> {
  const status = archived ? ARCHIVED_STATUS : { not: ARCHIVED_STATUS };
  const rows = await db.employee.findMany({
    where: userId ? { userId, status } : { status },
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
  data: {
    name: string;
    email?: string;
    department?: string;
    role?: string;
    phone?: string;
    status?: string;
  },
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

// Sets the archived flag. Returns the employee's name for the audit log, or
// null when nothing changed (not found, not in scope, or already in that
// state).
export async function setEmployeeArchived(
  employeeId: string,
  userId: string | null,
  archived: boolean,
): Promise<string | null> {
  const where = {
    ...(userId ? { id: employeeId, userId } : { id: employeeId }),
    status: archived ? { not: ARCHIVED_STATUS } : ARCHIVED_STATUS,
  };
  const row = await db.employee.findFirst({ where, select: { name: true } });
  if (!row) return null;
  const { count } = await db.employee.updateMany({
    where,
    data: { status: archived ? ARCHIVED_STATUS : "Active" },
  });
  return count > 0 ? row.name : null;
}

// One-time rename for rows soft-deleted before archiving existed. Idempotent.
export async function renameLegacyDeletedEmployees(): Promise<number> {
  const { count } = await db.employee.updateMany({
    where: { status: "Deleted" },
    data: { status: ARCHIVED_STATUS },
  });
  return count;
}

// Of the given ids, those that exist and are not archived. New links
// (participants, assignments) must only ever point at these.
export async function findActiveEmployeeIds(ids: string[]): Promise<string[]> {
  const rows = await db.employee.findMany({
    where: { id: { in: ids }, status: { not: ARCHIVED_STATUS } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
