// Parses an untrusted query-string date. Returns undefined for missing or
// unparseable input so callers degrade to "no filter" instead of passing an
// `Invalid Date` into a Prisma range query (which throws).
export function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
