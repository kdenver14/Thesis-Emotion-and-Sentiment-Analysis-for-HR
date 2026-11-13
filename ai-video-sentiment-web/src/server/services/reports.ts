import {
  getCompletedTalliesSince,
  type SessionTallyRow,
} from "~/server/repositories/session";
import {
  formatChange,
  lastQuarters,
  monthKey,
  monthLabel,
  monthOf,
  monthStart,
  previousMonth,
  quarterKey,
  quarterLabel,
  quarterMonths,
  quarterOf,
  quarterStart,
  type Quarter,
} from "~/lib/periods";
import {
  distributePercents,
  expressiveFromCounts,
  mergeEmotionCounts,
  sentimentFromCounts,
  type SentimentBreakdown,
} from "~/types/analysis";

// A year of calendar quarters, the current one included (to date).
export const REPORT_QUARTERS = 4;

export type PeriodStats = {
  sessionCount: number;
  lineCount: number;
  // Share of lines, the same rule as the dashboard.
  sentiment: SentimentBreakdown;
  expressivenessPct: number;
  topEmotion: { label: string; pct: number } | null;
};

export type QuarterSummary = PeriodStats & { quarter: Quarter };

function summarize(rows: SessionTallyRow[]): PeriodStats {
  const lineCount = rows.reduce((sum, r) => sum + r.utteranceCount, 0);
  const expressive = expressiveFromCounts(
    mergeEmotionCounts(rows.map((r) => r.emotionCounts)),
    lineCount,
  );
  const top = expressive.expressiveEmotions[0];
  return {
    sessionCount: rows.length,
    lineCount,
    sentiment: sentimentFromCounts(
      mergeEmotionCounts(rows.map((r) => r.sentimentCounts)),
    ),
    expressivenessPct: expressive.expressivenessPct,
    // Same rounding as the dashboard donut, so the two never differ by 1.
    topEmotion: top
      ? {
          label: top.label,
          pct:
            distributePercents(
              expressive.expressiveEmotions.map((e) => e.confidence),
            )[0] ?? 0,
        }
      : null,
  };
}

// Oldest quarter first. Sessions are placed by their session date.
export async function buildQuarterlyReport(
  now = new Date(),
): Promise<QuarterSummary[]> {
  const quarters = lastQuarters(now, REPORT_QUARTERS);
  const rows = await getCompletedTalliesSince(quarterStart(quarters[0]!));
  const byQuarter = new Map<string, SessionTallyRow[]>(
    quarters.map((q) => [quarterKey(q), []]),
  );
  for (const row of rows) {
    byQuarter.get(quarterKey(quarterOf(row.sessionDate)))?.push(row);
  }
  return quarters.map((q) => ({
    quarter: q,
    ...summarize(byQuarter.get(quarterKey(q)) ?? []),
  }));
}

export type ReportCell = { value: string; change: string | null };
export type ReportRow = { metric: string; cells: ReportCell[] };

type Metric = {
  metric: string;
  value: (s: QuarterSummary) => number;
  format: (n: number) => string;
  unit: string;
};

const PERCENT = (n: number) => `${n}%`;
const COUNT = (n: number) => n.toLocaleString();

const METRICS: Metric[] = [
  {
    metric: "Sessions analysed",
    value: (s) => s.sessionCount,
    format: COUNT,
    unit: "",
  },
  {
    metric: "Lines of speech",
    value: (s) => s.lineCount,
    format: COUNT,
    unit: "",
  },
  {
    metric: "Positive lines",
    value: (s) => s.sentiment.positive,
    format: PERCENT,
    unit: "pts",
  },
  {
    metric: "Neutral lines",
    value: (s) => s.sentiment.neutral,
    format: PERCENT,
    unit: "pts",
  },
  {
    metric: "Negative lines",
    value: (s) => s.sentiment.negative,
    format: PERCENT,
    unit: "pts",
  },
  {
    metric: "Expressive lines",
    value: (s) => s.expressivenessPct,
    format: PERCENT,
    unit: "pts",
  },
];

// The comparison table shared by the Reports page and its PDF.
// Counts (sessions, lines) always show, 0 included, but get no change in the
// current quarter: it is still partial, so a drop would only mean "not over
// yet". Shares need lines: a quarter without any shows "—" and is never
// compared.
export function reportTable(report: QuarterSummary[]): ReportRow[] {
  const last = report.length - 1;
  const rows = METRICS.map(({ metric, value, format, unit }) => ({
    metric,
    cells: report.map((s, i): ReportCell => {
      const prev = report[i - 1];
      if (unit === "") {
        return {
          value: format(value(s)),
          change:
            prev && i !== last ? formatChange(value(s), value(prev)) : null,
        };
      }
      if (s.lineCount === 0) return { value: "—", change: null };
      return {
        value: format(value(s)),
        change:
          prev && prev.lineCount > 0
            ? formatChange(value(s), value(prev), unit)
            : null,
      };
    }),
  }));
  rows.push({
    metric: "Top expressive emotion",
    cells: report.map((s) => ({
      value: s.topEmotion
        ? `${s.topEmotion.label[0]?.toUpperCase() ?? ""}${s.topEmotion.label.slice(1)} ${s.topEmotion.pct}%`
        : "—",
      change: null,
    })),
  });
  return rows;
}

// One sentence comparing the current quarter with the one before it.
export function reportHeadline(report: QuarterSummary[]): string {
  const current = report.at(-1);
  const previous = report.at(-2);
  if (!current || !previous) return "";
  const label = quarterLabel(previous.quarter);
  if (current.lineCount === 0 || previous.lineCount === 0) {
    return `Not enough analysed sessions yet to compare ${quarterLabel(current.quarter)} with ${label}.`;
  }
  const pts = (a: number, b: number) => formatChange(a, b, "pts");
  return (
    `So far in ${quarterLabel(current.quarter)}, compared with ${label}: positive lines ${pts(current.sentiment.positive, previous.sentiment.positive)}, ` +
    `negative lines ${pts(current.sentiment.negative, previous.sentiment.negative)}, ` +
    `expressive lines ${pts(current.expressivenessPct, previous.expressivenessPct)}.`
  );
}

export type QuarterlyReportView = {
  columns: { label: string; months: string; toDate: boolean }[];
  rows: ReportRow[];
  headline: string;
};

// Everything the Reports page and its PDF show.
export async function buildQuarterlyReportView(
  now = new Date(),
): Promise<QuarterlyReportView> {
  const report = await buildQuarterlyReport(now);
  return {
    columns: report.map((s, i) => ({
      label: quarterLabel(s.quarter),
      months: quarterMonths(s.quarter),
      toDate: i === report.length - 1,
    })),
    rows: reportTable(report),
    headline: reportHeadline(report),
  };
}

export type MonthComparison = {
  previous: PeriodStats & { label: string };
  // The current month, still in progress.
  current: PeriodStats & { label: string };
};

// HR Manager dashboard: this month so far against last month, optionally for
// one session type (the dashboard's type filter).
export async function buildMonthComparison(
  sessionType?: string,
  now = new Date(),
): Promise<MonthComparison> {
  const current = monthOf(now);
  const previous = previousMonth(current);
  const rows = await getCompletedTalliesSince(
    monthStart(previous),
    sessionType,
  );
  const inMonth = (key: string) =>
    rows.filter((r) => monthKey(monthOf(r.sessionDate)) === key);
  return {
    previous: {
      label: monthLabel(previous),
      ...summarize(inMonth(monthKey(previous))),
    },
    current: {
      label: monthLabel(current),
      ...summarize(inMonth(monthKey(current))),
    },
  };
}
