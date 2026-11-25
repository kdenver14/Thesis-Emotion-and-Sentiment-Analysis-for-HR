"use server";

import {
  getSessionsByUser,
  getSessionById,
  getAggregateEmotionMetrics,
  deleteSession,
  deleteSessionsBulk,
  updateSessionEmployee,
  updateSessionTitle,
  updateEmployeeSpeaker,
  setParticipantSpeaker,
  renameSpeaker,
  getSessionStatus as getSessionStatusFromRepo,
  getEmotionHeatmap,
  type SessionFilters,
  type ParsedSession,
  type ParsedSessionWithUtterances,
  type EmotionTrendRow,
} from "~/server/repositories/session";
import {
  currentUser,
  getAccessScope,
  requireScopeUserId,
  requireMutator,
} from "~/server/auth/guards";
import { resolveTrendDays } from "~/lib/trend";
import { findActiveEmployeeIds } from "~/server/repositories/employee";
import {
  SESSION_TITLE_MAX,
  sessionFiltersSchema,
  sessionIdsSchema,
  speakerBindingSchema,
} from "~/schemas/session";

const MAX_SPEAKER_NAME = 200;

async function assertCanMutate(): Promise<void> {
  await requireMutator();
}

export async function getSessions(
  filters: SessionFilters = {},
): Promise<ParsedSession[]> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return [];
  const userId = scope.kind === "own" ? scope.userId : null;
  // Untrusted filter object: strip anything that fails validation
  // rather than 500 the dashboard on a malformed sessionType.
  const parsed = sessionFiltersSchema.safeParse(filters);
  return getSessionsByUser(userId, parsed.success ? parsed.data : {});
}

export async function getSession(
  sessionId: string,
): Promise<ParsedSessionWithUtterances | null> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return null;
  const userId = scope.kind === "own" ? scope.userId : null;
  return getSessionById(sessionId, userId);
}

export async function getDashboardEmotionMetrics(sessionType?: string) {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") {
    return {
      expressive: {
        expressivenessPct: 0,
        topExpressiveEmotion: "neutral",
        expressiveEmotions: [],
      },
      allEmotions: {
        topEmotion: "neutral",
        topEmotionPct: 0,
        total: 0,
        breakdown: [],
      },
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      sessionCount: 0,
    };
  }
  const userId = scope.kind === "own" ? scope.userId : null;
  // Validate the untrusted sessionType the same way getSessions does:
  // reuse the shared filters schema so a garbage value is dropped rather
  // than reaching Prisma. Only { sessionType } is parsed here.
  const parsed = sessionFiltersSchema.safeParse({ sessionType });
  const safeType = parsed.success ? parsed.data.sessionType : undefined;
  return getAggregateEmotionMetrics(userId, safeType);
}

// Role-gated emotion trend. `days` is client-supplied and untrusted —
// resolveTrendDays clamps it per role (STAFF → no access → []).
export async function getEmotionTrend(
  days: number,
  sessionType?: string,
): Promise<EmotionTrendRow[]> {
  const user = await currentUser();
  if (!user) return [];

  const resolved = resolveTrendDays(user.role, days);
  if (resolved === null) return [];

  const userId = user.role === "STAFF" ? user.id : null;
  const parsed = sessionFiltersSchema.safeParse({ sessionType });
  const safeType = parsed.success ? parsed.data.sessionType : undefined;
  return getEmotionHeatmap(userId, resolved, safeType);
}

export async function fetchSessionStatus(
  sessionId: string,
): Promise<{ status: string; errorMessage: string | null } | null> {
  const scope = await getAccessScope();
  if (scope.kind === "unauthenticated") return null;
  const userId = scope.kind === "own" ? scope.userId : null;
  return getSessionStatusFromRepo(sessionId, userId);
}

export async function renameSession(
  sessionId: string,
  title: string,
): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Session title cannot be empty");
  if (trimmed.length > SESSION_TITLE_MAX)
    throw new Error(
      `Session title must be ${SESSION_TITLE_MAX} characters or fewer`,
    );
  await updateSessionTitle(sessionId, userId, trimmed);
}

export async function removeSession(sessionId: string): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  await deleteSession(sessionId, userId);
}

export async function removeSessionsBulk(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const parsed = sessionIdsSchema.safeParse(sessionIds);
  if (!parsed.success) throw new Error("Invalid session selection");
  await assertCanMutate();
  const userId = await requireScopeUserId();
  await deleteSessionsBulk(parsed.data, userId);
}

export async function assignSessionEmployee(
  sessionId: string,
  employeeId: string | null,
): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  // null unassigns; otherwise only an active employee can be linked.
  if (
    employeeId !== null &&
    (await findActiveEmployeeIds([employeeId])).length === 0
  ) {
    throw new Error("Unknown or archived employee");
  }
  await updateSessionEmployee(sessionId, userId, employeeId);
}

export async function renameSessionSpeaker(
  sessionId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Speaker name cannot be empty");
  if (trimmed.length > MAX_SPEAKER_NAME)
    throw new Error(
      `Speaker name must be ${MAX_SPEAKER_NAME} characters or fewer`,
    );
  await renameSpeaker(sessionId, userId, oldName, trimmed);
}

export async function setEmployeeSpeaker(
  sessionId: string,
  employeeSpeakerId: string | null,
): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  await updateEmployeeSpeaker(sessionId, userId, employeeSpeakerId);
}

// Meeting only: bind a declared participant to a detected speaker label
// (or null to unbind). employeeId must be a participant of the session;
// the repo layer enforces speaker-label uniqueness within the session.
export async function bindMeetingParticipantSpeaker(
  sessionId: string,
  employeeId: string,
  speakerLabel: string | null,
): Promise<void> {
  await assertCanMutate();
  const userId = await requireScopeUserId();
  const parsed = speakerBindingSchema.safeParse({ employeeId, speakerLabel });
  if (!parsed.success) throw new Error("Invalid speaker binding");
  await setParticipantSpeaker(
    sessionId,
    userId,
    parsed.data.employeeId,
    parsed.data.speakerLabel,
  );
}
