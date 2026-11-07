/**
 * Recompute every session's stored emotion tally (emotionCounts) and
 * utteranceCount from its utterances. Safe to run any number of times.
 *
 * Run after adding the columns, and again whenever sessions may have been
 * completed by an older build that did not write them:
 *   npx tsx scripts/backfill-emotion-counts.ts
 */
import { PrismaClient } from "@prisma/client";
import { countTopEmotions, type Score } from "../src/types/analysis";

const db = new PrismaClient();

async function main(): Promise<void> {
  // Same nested select the session list used before the tally existed (no
  // orderBy), so the tally's first-seen order, which breaks ties, matches.
  const sessions = await db.analysisSession.findMany({
    select: { id: true, utterances: { select: { emotions: true } } },
  });

  const updates = sessions.map((s) => {
    const utterances = s.utterances.map((u) => ({
      emotions: JSON.parse(u.emotions) as Score[],
    }));
    return db.analysisSession.update({
      where: { id: s.id },
      data: {
        emotionCounts: JSON.stringify(countTopEmotions(utterances)),
        utteranceCount: utterances.length,
      },
    });
  });
  await db.$transaction(updates);
  console.log(`Backfilled ${updates.length} sessions.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
