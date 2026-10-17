import { z } from "zod";
import { SESSION_TYPES } from "~/types/analysis";

export const sessionMetadataSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  sessionType: z.enum(SESSION_TYPES),
  employeeId: z.string().max(64).optional(),
  // Must be a parseable date; otherwise `new Date(...)` yields an
  // Invalid Date that Prisma would reject on write.
  sessionDate: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid session date")
    .optional(),
  interviewerName: z.string().max(200).optional(),
});

// Validates the client-supplied filter object passed to getSessions.
// Prisma parameterizes, so this is correctness (no garbage sessionType)
// not SQLi. Dates arrive as Date objects from server callers.
export const sessionFiltersSchema = z.object({
  employeeId: z.string().max(64).optional(),
  sessionType: z.enum(SESSION_TYPES).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
});

// Bulk delete: cap the array so a hostile caller cannot submit an
// unbounded id list (mass-delete / giant IN query).
export const sessionIdsSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(100);

// Meeting upload: declared employee participants. Min 2 (a meeting),
// capped so a hostile caller cannot create unbounded join rows, deduped
// so one employee cannot be declared twice.
const MAX_MEETING_PARTICIPANTS = 20;
export const meetingParticipantsSchema = z
  .array(z.string().min(1).max(64))
  .min(2, "A meeting needs at least 2 participants")
  .max(MAX_MEETING_PARTICIPANTS, `At most ${MAX_MEETING_PARTICIPANTS} participants`)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate participant");

// Post-inference: bind one declared participant to a detected speaker
// label (or null to unbind).
export const speakerBindingSchema = z.object({
  employeeId: z.string().min(1).max(64),
  speakerLabel: z.string().min(1).max(200).nullable(),
});

export const onboardingCandidateSchema = z.object({
  name: z.string().min(1, "Candidate name is required").max(200),
  position: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
});

export type SessionMetadataSchema = z.infer<typeof sessionMetadataSchema>;
export type OnboardingCandidateSchema = z.infer<typeof onboardingCandidateSchema>;
