import { z } from "zod";
import { SESSION_TYPES } from "~/types/analysis";

export const sessionMetadataSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  sessionType: z.enum(SESSION_TYPES),
  employeeId: z.string().optional(),
  sessionDate: z.string().optional(),
});

export type SessionMetadataSchema = z.infer<typeof sessionMetadataSchema>;
