import { z } from "zod";

export const MIN_EMPLOYEE_AGE = 18;
export const MAX_EMPLOYEE_AGE = 100;
export const EMPLOYEE_GENDERS = [
  "Male",
  "Female",
  "Other",
  "Prefer not to say",
] as const;
// UI never sends a status (defaults to "Active"); "Deleted" is the
// soft-delete tombstone. Constrain to the values the app actually uses.
export const EMPLOYEE_STATUSES = ["Active", "Deleted"] as const;

const ageField = z
  .number({ invalid_type_error: "Age must be a whole number" })
  .int("Age must be a whole number")
  .min(MIN_EMPLOYEE_AGE, `Employee must be at least ${MIN_EMPLOYEE_AGE} years old`)
  .max(MAX_EMPLOYEE_AGE, `Age must be ${MAX_EMPLOYEE_AGE} or below`);

const genderField = z.enum(EMPLOYEE_GENDERS, {
  errorMap: () => ({ message: "Invalid gender selection" }),
});

export const addEmployeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .max(254)
    .optional()
    .or(z.literal(""))
    .transform((e) => (e === "" ? undefined : e)),
  department: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  age: ageField.optional(),
  gender: genderField.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});

export const employeeDemographicsSchema = z.object({
  age: ageField.nullable(),
  gender: genderField.nullable(),
});

export type AddEmployeeSchema = z.infer<typeof addEmployeeSchema>;
export type EmployeeDemographicsSchema = z.infer<typeof employeeDemographicsSchema>;
