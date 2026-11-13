// Parses an untrusted query-string date. Returns undefined for missing or
// unparseable input so callers degrade to "no filter" instead of passing an
// `Invalid Date` into a Prisma range query (which throws).
export function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Seconds into a recording as mm:ss ("16:07"). Shared by the stored session
// summary and the transcript, so a moment named in one is findable in the other.
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
