"use server";

import { auth } from "~/server/auth";
import {
  createEmployee,
  deleteEmployee,
  findEmployeesByUser,
  updateEmployeeName,
  updateEmployeeDemographics,
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

const MIN_EMPLOYEE_AGE = 18;
const MAX_EMPLOYEE_AGE = 100;
const VALID_GENDERS = ["Male", "Female", "Other", "Prefer not to say"] as const;

export async function addEmployee(data: {
  name: string;
  email?: string;
  department?: string;
  phone?: string;
  age?: number;
  gender?: string;
  status?: string;
}): Promise<{ employee?: EmployeeRow; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR") return { error: "Directors cannot create employee records" };

  if (!data.name.trim()) return { error: "Name is required" };

  if (data.age !== undefined) {
    if (!Number.isInteger(data.age)) return { error: "Age must be a whole number" };
    if (data.age < MIN_EMPLOYEE_AGE) return { error: `Employee must be at least ${MIN_EMPLOYEE_AGE} years old` };
    if (data.age > MAX_EMPLOYEE_AGE) return { error: `Age must be ${MAX_EMPLOYEE_AGE} or below` };
  }

  if (data.gender !== undefined && !VALID_GENDERS.includes(data.gender as (typeof VALID_GENDERS)[number])) {
    return { error: "Invalid gender selection" };
  }

  const employee = await createEmployee(session.user.id, {
    name: data.name.trim(),
    email: data.email?.trim() ?? undefined,
    department: data.department?.trim() ?? undefined,
    phone: data.phone?.trim() ?? undefined,
    age: data.age,
    gender: data.gender,
    status: data.status ?? "Active",
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
  const userId = session.user.role === "STAFF" ? session.user.id : null;
  await updateEmployeeName(employeeId, userId, trimmed);
}

export async function updateEmployeeDemographicsAction(
  employeeId: string,
  data: { age: number | null; gender: string | null },
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" };
  if (session.user.role === "DIRECTOR")
    return { error: "Directors cannot edit employee records" };

  let age: number | null = null;
  if (data.age !== null) {
    if (!Number.isInteger(data.age))
      return { error: "Age must be a whole number" };
    if (data.age < MIN_EMPLOYEE_AGE)
      return { error: `Employee must be at least ${MIN_EMPLOYEE_AGE} years old` };
    if (data.age > MAX_EMPLOYEE_AGE)
      return { error: `Age must be ${MAX_EMPLOYEE_AGE} or below` };
    age = data.age;
  }

  let gender: string | null = null;
  if (data.gender !== null) {
    if (!VALID_GENDERS.includes(data.gender as (typeof VALID_GENDERS)[number]))
      return { error: "Invalid gender selection" };
    gender = data.gender;
  }

  const userId = session.user.role === "STAFF" ? session.user.id : null;
  await updateEmployeeDemographics(employeeId, userId, { age, gender });
  return {};
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
