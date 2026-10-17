import { z } from "zod";

// UI never sends a status (defaults to "Active"); "Deleted" is the
// soft-delete tombstone. Constrain to the values the app actually uses.
export const EMPLOYEE_STATUSES = ["Active", "Deleted"] as const;

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
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});

export type AddEmployeeSchema = z.infer<typeof addEmployeeSchema>;
