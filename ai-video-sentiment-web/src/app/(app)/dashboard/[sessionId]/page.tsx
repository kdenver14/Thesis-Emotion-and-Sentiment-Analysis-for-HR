import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiLoader } from "react-icons/fi";
import { getSession, renameSession } from "~/actions/sessions";
import { auth } from "~/server/auth";
import { getEmployees } from "~/actions/employees";
import { AssignEmployee } from "~/components/client/AssignEmployee";
import { InlineTitle } from "~/components/client/InlineTitle";
import { SessionSummary } from "~/components/client/SessionSummary";
import { PromoteCandidateButton } from "~/components/client/PromoteCandidateButton";
import { RejectCandidateButton } from "~/components/client/RejectCandidateButton";
import { UndoRejectionButton } from "~/components/client/UndoRejectionButton";
import { candidateDeletionDate } from "~/lib/retention";
import { EmotionBarChart } from "~/components/client/charts/EmotionBarChart";
import { SpeakerTimeline } from "~/components/client/charts/SpeakerTimeline";
import { MeetingSpeakerBinding } from "~/components/client/MeetingSpeakerBinding";
import { ExportButtons } from "~/components/client/ExportButtons";
import { ProcessingPoller } from "~/components/client/ProcessingPoller";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { SESSION_TYPE_LABELS, computeTopEmotion } from "~/types/analysis";

// Retention dates are shown in the HR team's timezone so the deletion date on
// screen matches the day the server-side purge actually acts.
const RETENTION_TZ = "Asia/Manila";
const retentionDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RETENTION_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { sessionId } = await params;
  const [session, employees, authSession] = await Promise.all([
    getSession(sessionId),
    getEmployees(),
    auth(),
  ]);
  const role = authSession?.user?.role ?? "STAFF";
  const canMutate = role !== "DIRECTOR";

  if (!session) notFound();

  const sessionTypeLabel =
    SESSION_TYPE_LABELS[
      session.sessionType as keyof typeof SESSION_TYPE_LABELS
    ] ?? session.sessionType;

  if (session.status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <ProcessingPoller sessionId={sessionId} />
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">{session.title}</h1>
          <p className="text-sm text-gray-500">
            {session.sessionDate.toLocaleDateString("en-GB")} · {sessionTypeLabel}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-200 py-20">
          <FiLoader className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm font-medium text-gray-600">Analysing video...</p>
          <p className="text-xs text-gray-400">
            You can navigate away — this will keep running in the background.
          </p>
        </div>
      </div>
    );
  }

  if (session.status === "FAILED") {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">{session.title}</h1>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 py-16">
          <p className="text-sm font-medium text-red-700">Analysis failed</p>
          {session.errorMessage && (
            <p className="text-xs text-red-500">{session.errorMessage}</p>
          )}
          {canMutate && <DeleteSessionButton sessionId={session.id} />}
        </div>
      </div>
    );
  }

  const speakers = [
    ...new Set(session.utterances.map((u) => u.speaker).filter((s): s is string => s !== null)),
  ];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
        >
          <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            {canMutate ? (
              <InlineTitle
                initialValue={session.title}
                save={renameSession.bind(null, session.id)}
                className="text-xl font-semibold text-gray-900"
              />
            ) : (
              <h1 className="text-xl font-semibold text-gray-900">
                {session.title}
              </h1>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span>{session.sessionDate.toLocaleDateString("en-GB")}</span>
              <span>·</span>
              <span>{sessionTypeLabel}</span>
              <span>·</span>
              <span>Uploaded {session.createdAt.toLocaleDateString("en-GB")}</span>
              {session.interviewerName && (
                <>
                  <span>·</span>
                  <span>Interviewer: {session.interviewerName}</span>
                </>
              )}
              {session.sessionType !== "interview" && (
                <>
                  <span>·</span>
                  {session.sessionType === "meeting" ? (
                    <span>
                      {session.participants.length} participant
                      {session.participants.length !== 1 ? "s" : ""}
                    </span>
                  ) : canMutate ? (
                    <AssignEmployee
                      sessionId={session.id}
                      employees={employees}
                      current={session.employee ?? null}
                    />
                  ) : (
                    <span>{session.employee?.name ?? "Unassigned"}</span>
                  )}
                </>
              )}
              {session.durationSecs && (
                <>
                  <span>·</span>
                  <span>{session.durationSecs.toFixed(0)}s</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons sessionId={session.id} userRole={role} />
            {canMutate && <DeleteSessionButton sessionId={session.id} />}
          </div>
        </div>
      </div>

      {/* Interview candidate */}
      {session.onboardingCandidate && (
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            Candidate details
          </h2>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">Name</dt>
              <dd className="font-medium text-gray-900">
                {session.onboardingCandidate.name}
              </dd>
            </div>
            {session.onboardingCandidate.position && (
              <div>
                <dt className="text-xs text-gray-500">Position applied for</dt>
                <dd className="font-medium text-gray-900">
                  {session.onboardingCandidate.position}
                </dd>
              </div>
            )}
            {session.onboardingCandidate.email && (
              <div>
                <dt className="text-xs text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">
                  {session.onboardingCandidate.email}
                </dd>
              </div>
            )}
            {session.onboardingCandidate.phone && (
              <div>
                <dt className="text-xs text-gray-500">Phone</dt>
                <dd className="font-medium text-gray-900">
                  {session.onboardingCandidate.phone}
                </dd>
              </div>
            )}
          </dl>
          {(() => {
            const candidate = session.onboardingCandidate;
            const { rejectedAt, promotedEmployeeId } = candidate;
            const rejectedLabel = rejectedAt
              ? retentionDateFormatter.format(rejectedAt)
              : null;
            const deletionLabel = rejectedAt
              ? retentionDateFormatter.format(candidateDeletionDate(rejectedAt))
              : null;

            let body: ReactNode = null;
            if (rejectedAt) {
              body = canMutate ? (
                <UndoRejectionButton
                  sessionId={session.id}
                  rejectedDateLabel={rejectedLabel!}
                  deletionDateLabel={deletionLabel!}
                />
              ) : (
                <p className="text-xs text-gray-600">
                  Rejected on {rejectedLabel}. This session will be deleted on{" "}
                  {deletionLabel}.
                </p>
              );
            } else if (promotedEmployeeId) {
              body = canMutate ? (
                <PromoteCandidateButton
                  sessionId={session.id}
                  promotedEmployeeId={promotedEmployeeId}
                />
              ) : (
                <p className="text-xs text-gray-500">Added as employee</p>
              );
            } else if (canMutate) {
              body = (
                <div className="flex flex-col gap-3">
                  <PromoteCandidateButton
                    sessionId={session.id}
                    promotedEmployeeId={null}
                  />
                  <RejectCandidateButton sessionId={session.id} />
                </div>
              );
            }

            if (!body) return null;
            return (
              <div className="mt-4 border-t border-gray-100 pt-3">{body}</div>
            );
          })()}
        </div>
      )}

      {/* Summary */}
      <SessionSummary
        summary={session.summary}
        avgSentiments={session.avgSentiments}
        expressive={{
          expressivenessPct: session.expressivenessPct,
          topExpressiveEmotion: session.topExpressiveEmotion,
          expressiveEmotions: session.expressiveEmotions,
        }}
        allEmotions={computeTopEmotion(session.utterances)}
        topSentiment={session.topSentiment}
      />

      {/* Emotion distribution */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Emotion distribution
        </h2>
        <EmotionBarChart data={session.avgEmotions} height={200} />
      </div>

      {/* Meeting participant ↔ speaker binding */}
      {session.sessionType === "meeting" && (
        <MeetingSpeakerBinding
          sessionId={session.id}
          speakers={speakers}
          participants={session.participants}
          canMutate={canMutate}
        />
      )}

      {/* Utterance timeline */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Utterance timeline
        </h2>
        <SpeakerTimeline
          sessionId={session.id}
          utterances={session.utterances}
          speakers={speakers}
          employeeSpeakerId={session.employeeSpeakerId}
          canMutate={canMutate}
        />
      </div>
    </div>
  );
}
