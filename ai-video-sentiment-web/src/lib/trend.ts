import type { Role } from "~/types/roles";

// Trend-window policy. Server-side authority — the action clamps the
// client-supplied day count through resolveTrendDays before querying.
//   MANAGER: 30-day only.
//   DIRECTOR: 30-day or 90-day.
//   STAFF:    no trend chart.
export const TREND_WINDOWS: Record<Role, readonly number[]> = {
  MANAGER: [30],
  DIRECTOR: [30, 90],
  STAFF: [],
} as const;

export const WINDOW_LABELS: Record<number, string> = {
  30: "Last 30 days",
  90: "Last 3 months",
};

export function allowedWindows(role: Role): readonly number[] {
  return TREND_WINDOWS[role];
}

export function hasTrendAccess(role: Role): boolean {
  return TREND_WINDOWS[role].length > 0;
}

// Coerce + validate. Any value not explicitly allowed for the role
// collapses to the role's minimum window (never the requested value).
// Returns null when the role has no trend access at all.
export function resolveTrendDays(
  role: Role,
  requested: unknown,
): number | null {
  const windows = TREND_WINDOWS[role];
  if (windows.length === 0) return null;

  const min = windows[0]!;
  const n = Number(requested);
  if (!Number.isFinite(n)) return min;
  return windows.includes(n) ? n : min;
}
