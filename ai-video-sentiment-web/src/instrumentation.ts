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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Do not run (or start a timer) during the production build step.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

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
