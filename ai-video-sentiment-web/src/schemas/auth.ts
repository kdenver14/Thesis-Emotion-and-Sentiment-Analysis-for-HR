import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  // Single-use handoff from the 2FA server action to authorize(). Absent on
  // the client form (react-hook-form never registers it); present only on the
  // programmatic signIn() call that completes a code-verified login.
  proof: z.string().optional(),
});

export type LoginSchema = z.infer<typeof loginSchema>;

// Account names: letters (any alphabet), spaces, hyphens, apostrophes and
// periods. No digits or other symbols.
export const userNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name must be 200 characters or fewer")
  .regex(
    /^[\p{L}\p{M} .'\u2019-]+$/u,
    "Only letters, spaces, hyphens (-), apostrophes (') and periods (.) are allowed",
  );

// 72 = bcrypt's hard input ceiling (bytes beyond are silently dropped).
export const PASSWORD_MAX = 72;
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer`);
