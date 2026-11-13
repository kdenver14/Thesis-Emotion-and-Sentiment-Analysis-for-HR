/**
 * Recompute every session's stored per-line figures (emotionCounts,
 * sentimentCounts, utteranceCount, topSentiment, summary) from its
 * utterances. Safe to run any number of times. The server also fills
 * missing ones on start, so this is only for a full recompute:
 *   npx tsx scripts/backfill-session-tallies.ts
 */
import { PrismaClient } from "@prisma/client";
import { computeSessionTallies } from "../src/server/services/summary";
import type { Score } from "../src/types/analysis";

const db = new PrismaClient();

async function main(): Promise<void> {
  // Completed only: other statuses have no lines yet, and an in-flight
  // callback must not be overwritten. No orderBy: the same first-seen order
  // the result callback uses, which breaks ties in the tallies.
  const sessions = await db.analysisSession.findMany({
    where: { status: "COMPLETED" },
    select: {
      id: true,
      utterances: {
        select: { startTime: true, emotions: true, sentiments: true },
      },
    },
  });

  const updates = sessions.map((s) =>
    db.analysisSession.update({
      where: { id: s.id },
      data: computeSessionTallies(
        s.utterances.map((u) => ({
          start_time: u.startTime,
          emotions: JSON.parse(u.emotions) as Score[],
          sentiments: JSON.parse(u.sentiments) as Score[],
        })),
      ),
    }),
  );
  await db.$transaction(updates);
  console.log(`Recomputed ${updates.length} sessions.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
