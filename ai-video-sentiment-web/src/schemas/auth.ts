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

// 72 = bcrypt's hard input ceiling (bytes beyond are silently dropped).
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");
