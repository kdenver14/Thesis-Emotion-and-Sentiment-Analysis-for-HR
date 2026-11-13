// Next.js server bootstrap. Runs the rejected-candidate retention purge once at
// startup, then every 24 hours. Node.js runtime only; the db is imported lazily
// so the Edge runtime and the build step never pull it in.

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const globalForPurge = globalThis as typeof globalThis & {
  __rejectedCandidatePurgeTimer?: ReturnType<typeof setInterval>;
};

async function runPurge(): Promise<void> {
  try {
    const { purgeExpiredRejectedCandidateSessions } = await import(
      "~/server/services/retention"
    );
    const deleted = await purgeExpiredRejectedCandidateSessions();
    if (deleted > 0) {
      console.log(
        `[retention] purged ${deleted} expired rejected-candidate session(s)`,
      );
    }
  } catch (err) {
    console.error("[retention] purge failed", err);
  }
}

// Sessions saved by an older build lack some stored per-line figures; fill
// them so lists and totals stay right with no manual backfill.
async function fillTallies(): Promise<void> {
  try {
    const { fillMissingSessionTallies } = await import(
      "~/server/services/tallies"
    );
    const fixed = await fillMissingSessionTallies();
    if (fixed > 0) {
      console.log(`[tallies] filled ${fixed} session(s)`);
    }
  } catch (err) {
    console.error("[tallies] fill failed", err);
  }
}

// Employees soft-deleted before archiving existed were stored as "Deleted";
// the archive screens read "Archived".
async function renameDeletedEmployees(): Promise<void> {
  try {
    const { renameLegacyDeletedEmployees } = await import(
      "~/server/repositories/employee"
    );
    const renamed = await renameLegacyDeletedEmployees();
    if (renamed > 0) {
      console.log(
        `[employees] marked ${renamed} deleted employee(s) as archived`,
      );
    }
  } catch (err) {
    console.error("[employees] archive rename failed", err);
  }
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Do not run (or start a timer) during the production build step.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  await renameDeletedEmployees();
  await fillTallies();
  await runPurge();

  if (!globalForPurge.__rejectedCandidatePurgeTimer) {
    const timer = setInterval(() => {
      void runPurge();
    }, PURGE_INTERVAL_MS);
    // Do not keep the process alive solely for this timer.
    timer.unref?.();
    globalForPurge.__rejectedCandidatePurgeTimer = timer;
  }
}
