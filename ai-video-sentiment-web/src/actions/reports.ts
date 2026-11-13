"use server";

import { currentUser } from "~/server/auth/guards";
import { sessionFiltersSchema } from "~/schemas/session";
import {
  buildMonthComparison,
  buildQuarterlyReportView,
  type MonthComparison,
  type QuarterlyReportView,
} from "~/server/services/reports";

// The full quarterly report is the HR Director's (Reports tab and its PDF);
// null for everyone else.
export async function getQuarterlyReport(): Promise<QuarterlyReportView | null> {
  const user = await currentUser();
  if (user?.role !== "DIRECTOR") return null;
  return buildQuarterlyReportView();
}

// HR Managers get this month against last month on the dashboard instead;
// null for everyone else. `sessionType` is untrusted: validated like the
// dashboard's other filters.
export async function getMonthComparison(
  sessionType?: string,
): Promise<MonthComparison | null> {
  const user = await currentUser();
  if (user?.role !== "MANAGER") return null;
  const parsed = sessionFiltersSchema.safeParse({ sessionType });
  return buildMonthComparison(
    parsed.success ? parsed.data.sessionType : undefined,
  );
}
