import { z } from "zod";
import { PHONE_FORMAT_MESSAGE, STORED_PHONE_PATTERN } from "~/lib/phone";

// UI never sends a status (defaults to "Active"). "Archived" replaces
// deleting: the employee leaves the lists and pickers, their sessions stay
// linked, and Restore brings them back. Rows from before archiving existed
// said "Deleted"; startup renames them (renameLegacyDeletedEmployees).
export const ARCHIVED_STATUS = "Archived";
export const EMPLOYEE_STATUSES = ["Active", ARCHIVED_STATUS] as const;

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
  phone: z
    .string()
    .trim()
    .regex(STORED_PHONE_PATTERN, PHONE_FORMAT_MESSAGE)
    .optional(),
});

export type AddEmployeeSchema = z.infer<typeof addEmployeeSchema>;
