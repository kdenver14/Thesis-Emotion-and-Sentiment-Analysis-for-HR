import { deleteExpiredRejectedCandidateSessions } from "~/server/repositories/session";
import { rejectionPurgeCutoff } from "~/lib/retention";

// Deletes interview sessions whose rejected candidate has passed the retention
// window. Returns the number of sessions deleted.
export async function purgeExpiredRejectedCandidateSessions(): Promise<number> {
  const cutoff = rejectionPurgeCutoff(new Date());
  return deleteExpiredRejectedCandidateSessions(cutoff);
}
