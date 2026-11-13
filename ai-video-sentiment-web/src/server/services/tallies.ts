import {
  findSessionsMissingTallies,
  saveSessionTallies,
} from "~/server/repositories/session";
import { computeSessionTallies } from "./summary";

// Fills the stored per-line figures for completed sessions saved by a build
// that did not write them yet. Runs at server start (src/instrumentation.ts),
// so no one has to run the backfill script by hand. Returns how many it fixed.
export async function fillMissingSessionTallies(): Promise<number> {
  const stale = await findSessionsMissingTallies();
  await saveSessionTallies(
    stale.map((s) => ({ id: s.id, ...computeSessionTallies(s.utterances) })),
  );
  return stale.length;
}
