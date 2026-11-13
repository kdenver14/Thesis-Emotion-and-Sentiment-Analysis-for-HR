// Calendar months and quarters (Q1 = Jan to Mar) in the HR team's time zone.
// Match DASHBOARD_TZ in src/server/repositories/session.ts.
const REPORT_TZ = "Asia/Manila";
// Manila has no daylight saving time, so its UTC offset never changes.
const REPORT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS_PER_QUARTER = 3;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_FULL_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type Quarter = { year: number; q: number };
// month: 1 to 12.
export type Month = { year: number; month: number };

// en-CA formats year and month as "2026-11".
const yearMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TZ,
  year: "numeric",
  month: "2-digit",
});

// The Manila calendar day as "YYYY-MM-DD" (the value a date input holds).
// Plain string comparison orders these correctly.
export function dayKey(date: Date): string {
  return new Date(date.getTime() + REPORT_TZ_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

export function monthOf(date: Date): Month {
  const [year = 0, month = 1] = yearMonth.format(date).split("-").map(Number);
  return { year, month };
}

export function previousMonth({ year, month }: Month): Month {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

export function monthKey({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel({ year, month }: Month): string {
  return `${MONTH_FULL_NAMES[month - 1]} ${year}`;
}

// First instant of the month in the report time zone.
export function monthStart({ year, month }: Month): Date {
  return new Date(Date.UTC(year, month - 1, 1) - REPORT_TZ_OFFSET_MS);
}

export function quarterOf(date: Date): Quarter {
  const { year, month } = monthOf(date);
  return { year, q: Math.floor((month - 1) / MONTHS_PER_QUARTER) + 1 };
}

export function previousQuarter({ year, q }: Quarter): Quarter {
  return q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 };
}

// The quarter containing `now` and the n - 1 before it, oldest first.
export function lastQuarters(now: Date, n: number): Quarter[] {
  const quarters = [quarterOf(now)];
  while (quarters.length < n) {
    quarters.unshift(previousQuarter(quarters[0]!));
  }
  return quarters;
}

export function quarterKey({ year, q }: Quarter): string {
  return `${year}-Q${q}`;
}

export function quarterLabel({ year, q }: Quarter): string {
  return `Q${q} ${year}`;
}

export function quarterMonths({ q }: Quarter): string {
  const first = (q - 1) * MONTHS_PER_QUARTER;
  return `${MONTH_NAMES[first]} to ${MONTH_NAMES[first + MONTHS_PER_QUARTER - 1]}`;
}

// First instant of the quarter in the report time zone.
export function quarterStart({ year, q }: Quarter): Date {
  return monthStart({ year, month: (q - 1) * MONTHS_PER_QUARTER + 1 });
}

// "+3 pts", "-2", "no change". ASCII minus so PDF fonts render it.
export function formatChange(
  current: number,
  previous: number,
  unit = "",
): string {
  const diff = current - previous;
  if (diff === 0) return "no change";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${Math.abs(diff).toLocaleString()}${unit ? ` ${unit}` : ""}`;
}
