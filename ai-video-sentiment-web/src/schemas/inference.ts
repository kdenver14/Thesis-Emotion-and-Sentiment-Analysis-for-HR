import { z } from "zod";

// Validates the Python inference server's JSON before it is persisted.
// Out-of-process boundary: the web app must not trust `as InferenceResult`.
// Unknown keys are stripped (forward-compatible with model additions);
// shape and types are enforced so malformed output cannot corrupt the DB.

const MAX_UTTERANCE_TEXT = 10_000;

const scoreSchema = z.object({
  label: z.string().min(1).max(64),
  confidence: z.number().finite(),
});

const utteranceSchema = z.object({
  start_time: z.number().finite().nonnegative(),
  end_time: z.number().finite().nonnegative(),
  text: z.string().max(MAX_UTTERANCE_TEXT),
  speaker: z.string().max(200).optional(),
  emotions: z.array(scoreSchema),
  sentiments: z.array(scoreSchema),
});

export const inferenceResultSchema = z.object({
  utterances: z.array(utteranceSchema),
});

export type InferenceResultSchema = z.infer<typeof inferenceResultSchema>;
