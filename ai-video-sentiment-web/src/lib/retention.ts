import { addMonths, subMonths } from "date-fns";

// Client retention rule (Arup / BlastAsia): once an applicant is rejected the
// hiring purpose is done; 6 months covers reapplications or disputes. After
// that the interview session is deleted.
export const REJECTED_CANDIDATE_RETENTION_MONTHS = 6;

// Calendar-month arithmetic (date-fns clamps month-end, e.g. Aug 31 -> Feb 28).
export function candidateDeletionDate(rejectedAt: Date): Date {
  return addMonths(rejectedAt, REJECTED_CANDIDATE_RETENTION_MONTHS);
}

// A rejected candidate is due for deletion once rejectedAt is older than this
// cutoff (now minus the retention window).
export function rejectionPurgeCutoff(now: Date): Date {
  return subMonths(now, REJECTED_CANDIDATE_RETENTION_MONTHS);
}
