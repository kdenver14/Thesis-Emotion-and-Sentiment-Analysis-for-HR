import { z } from "zod";
import { SESSION_TYPES } from "~/types/analysis";

export const sessionMetadataSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  sessionType: z.enum(SESSION_TYPES),
  employeeId: z.string().optional(),
  sessionDate: z.string().optional(),
  interviewerName: z.string().max(200).optional(),
});

export const onboardingCandidateSchema = z.object({
  name: z.string().min(1, "Candidate name is required").max(200),
  position: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
});

export type SessionMetadataSchema = z.infer<typeof sessionMetadataSchema>;
export type OnboardingCandidateSchema = z.infer<typeof onboardingCandidateSchema>;
