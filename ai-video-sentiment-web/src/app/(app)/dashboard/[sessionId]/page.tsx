import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  FiArrowLeft,
  FiCalendar,
  FiLoader,
  FiMic,
  FiTag,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { getSession, renameSession } from "~/actions/sessions";
import { auth } from "~/server/auth";
import { getEmployees } from "~/actions/employees";
import { AssignEmployee } from "~/components/client/AssignEmployee";
import { InlineTitle } from "~/components/client/InlineTitle";
import { SESSION_TITLE_MAX } from "~/schemas/session";
import { SessionSummary } from "~/components/client/SessionSummary";
import { Fact } from "~/components/Fact";
import { PromoteCandidateButton } from "~/components/client/PromoteCandidateButton";
import { RejectCandidateButton } from "~/components/client/RejectCandidateButton";
import { UndoRejectionButton } from "~/components/client/UndoRejectionButton";
import { candidateDeletionDate } from "~/lib/retention";
import { SpeakerTimeline } from "~/components/client/charts/SpeakerTimeline";
import { MeetingSpeakerBinding } from "~/components/client/MeetingSpeakerBinding";
import { ExportButtons } from "~/components/client/ExportButtons";
import { ProcessingPoller } from "~/components/client/ProcessingPoller";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { CancelAnalysisButton } from "./CancelAnalysisButton";
import { generateSummary } from "~/server/services/summary";
import {
  SESSION_TYPE_LABELS,
  computeExpressive,
  toPercentSlices,
} from "~/types/analysis";

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
    SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;

  // UPLOADING is reached when the user leaves the upload page mid-upload:
  // same loading view, so Cancel is always one click from the dashboard.
  if (session.status === "PROCESSING" || session.status === "UPLOADING") {
    const uploading = session.status === "UPLOADING";
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <ProcessingPoller sessionId={sessionId} status={session.status} />
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">
            {session.title}
          </h1>
          <p className="text-sm text-gray-500">
            {session.sessionDate.toLocaleDateString("en-GB")} ·{" "}
            {sessionTypeLabel}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-200 py-20">
          <FiLoader className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm font-medium text-gray-600">
            {uploading ? "Uploading video..." : "Analysing video..."}
          </p>
          <p className="max-w-md text-center text-xs text-gray-400">
            {uploading
              ? "Keep this tab open until the upload finishes. Analysis starts on its own after that. If the page was reloaded or closed, the upload stopped: cancel and upload again."
              : "You can navigate away. This keeps running in the background."}
          </p>
          {canMutate && <CancelAnalysisButton sessionId={session.id} />}
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
          <h1 className="text-xl font-semibold text-gray-900">
            {session.title}
          </h1>
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
    ...new Set(
      session.utterances
        .map((u) => u.speaker)
        .filter((s): s is string => s !== null),
    ),
  ];
  // Same pure function that wrote the stored summary text, so the visual
  // summary and the text always agree.
  const summary = generateSummary(
    session.utterances.map((u) => ({
      start_time: u.startTime,
      emotions: u.emotions,
      sentiments: u.sentiments,
    })),
  );
  const expressive = computeExpressive(session.utterances);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/dashboard"
          className="flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
        >
          <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            {canMutate ? (
              <InlineTitle
                initialValue={session.title}
                save={renameSession.bind(null, session.id)}
                maxLength={SESSION_TITLE_MAX}
                className="text-xl font-semibold text-gray-900"
              />
            ) : (
              <h1 className="text-xl font-semibold text-gray-900">
                {session.title}
              </h1>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <ExportButtons sessionId={session.id} userRole={role} />
            {canMutate && (
              <DeleteSessionButton sessionId={session.id} iconOnly />
            )}
          </div>
        </div>
        {/* Icons stand in for word labels to keep the row light; each icon
            still names its value for hover and screen readers. */}
        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          <Fact icon={FiCalendar} label="Date">
            {session.sessionDate.toLocaleDateString("en-GB")}
          </Fact>
          <Fact icon={FiTag} label="Type">
            {sessionTypeLabel}
          </Fact>
          {session.sessionType === "meeting" ? (
            <Fact icon={FiUsers} label="Participants">
              {session.participants.length} participant
              {session.participants.length !== 1 ? "s" : ""}
            </Fact>
          ) : (
            session.sessionType !== "interview" && (
              <Fact icon={FiUser} label="Employee">
                {canMutate ? (
                  <AssignEmployee
                    sessionId={session.id}
                    employees={employees}
                    current={session.employee ?? null}
                  />
                ) : session.employee ? (
                  <Link
                    href={`/employees/${session.employee.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {session.employee.name}
                  </Link>
                ) : (
                  "Unassigned"
                )}
              </Fact>
            )
          )}
          {session.interviewerName && (
            <Fact icon={FiMic} label="Interviewer">
              {session.interviewerName}
            </Fact>
          )}
        </dl>
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
            } else {
              body = <p className="text-xs text-gray-500">Pending decision</p>;
            }

            return (
              <div className="mt-4 border-t border-gray-100 pt-3">{body}</div>
            );
          })()}
        </div>
      )}

      <SessionSummary
        sentiment={summary.sentiment}
        sentimentDescription={`Main tone of each of the ${summary.total} utterance${summary.total !== 1 ? "s" : ""}`}
        emotionSlices={toPercentSlices(expressive.expressiveEmotions)}
        emotionsDescription={`Among the ${expressive.expressivenessPct}% of utterances that were not neutral`}
        peakCount={summary.peakCount}
        peakTimes={summary.peakTimes}
        filterPath={`/dashboard/${session.id}`}
      />

      {/* Meeting participant/speaker binding stays visible: speakerLabel is
          the per-employee analytics join key, so it must never be buried. */}
      {session.sessionType === "meeting" && (
        <MeetingSpeakerBinding
          sessionId={session.id}
          speakers={speakers}
          participants={session.participants}
          canMutate={canMutate}
        />
      )}

      {/* Target of the summary legend links (#transcript). */}
      <section
        id="transcript"
        // Focusable so keyboard users land here after a legend link jumps.
        tabIndex={-1}
        className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 p-4 focus:outline-none"
      >
        <h3 className="text-sm font-medium text-gray-800">Transcript</h3>
        <SpeakerTimeline
          sessionId={session.id}
          utterances={session.utterances}
          speakers={speakers}
          employeeSpeakerId={session.employeeSpeakerId}
          canMutate={canMutate}
        />
      </section>
    </div>
  );
}
