import { PrismaClient } from "@prisma/client";
import { generateSummary } from "../src/server/services/summary";
import type { Score } from "../src/types/analysis";

// One-off: rewrite the stored summary of every COMPLETED session using the
// current generateSummary, so old sessions drop the removed sentences.
const db = new PrismaClient();

async function main() {
  const sessions = await db.analysisSession.findMany({
    where: { status: "COMPLETED" },
    select: {
      id: true,
      title: true,
      utterances: {
        select: {
          startTime: true,
          endTime: true,
          text: true,
          speaker: true,
          emotions: true,
          sentiments: true,
        },
      },
    },
  });

  let updated = 0;
  for (const s of sessions) {
    const utterances = s.utterances.map((u) => ({
      start_time: u.startTime,
      end_time: u.endTime,
      text: u.text,
      speaker: u.speaker ?? undefined,
      emotions: JSON.parse(u.emotions) as Score[],
      sentiments: JSON.parse(u.sentiments) as Score[],
    }));
    const { text } = generateSummary(utterances);
    await db.analysisSession.update({
      where: { id: s.id },
      data: { summary: text },
    });
    updated++;
    console.log(`[${updated}] ${s.id} (${s.title}) -> ${text}`);
  }
  console.log(`Done. Regenerated ${updated} session summar${updated !== 1 ? "ies" : "y"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
