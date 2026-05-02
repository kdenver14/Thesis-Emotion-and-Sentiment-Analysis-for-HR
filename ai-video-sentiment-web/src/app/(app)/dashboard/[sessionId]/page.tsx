import { notFound } from "next/navigation";
import Link from "next/link";
import { FiArrowLeft, FiLoader } from "react-icons/fi";
import { getSession, renameSession } from "~/actions/sessions";
import { auth } from "~/server/auth";
import { getEmployees } from "~/actions/employees";
import { AssignEmployee } from "~/components/client/AssignEmployee";
import { InlineTitle } from "~/components/client/InlineTitle";
import { SessionSummary } from "~/components/client/SessionSummary";
import { EmotionBarChart } from "~/components/client/charts/EmotionBarChart";
import { SpeakerTimeline } from "~/components/client/charts/SpeakerTimeline";
import { ExportButtons } from "~/components/client/ExportButtons";
import { ProcessingPoller } from "~/components/client/ProcessingPoller";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { SESSION_TYPE_LABELS } from "~/types/analysis";

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
              <span>·</span>
              {canMutate ? (
                <AssignEmployee
                  sessionId={session.id}
                  employees={employees}
                  current={session.employee ?? null}
                />
              ) : (
                <span>{session.employee?.name ?? "Unassigned"}</span>
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

      {/* Onboarding candidate */}
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
        </div>
      )}

      {/* Summary */}
      <SessionSummary
        summary={session.summary}
        engagementScore={session.engagementScore}
        topEmotion={session.topEmotion}
        topSentiment={session.topSentiment}
      />

      {/* Emotion distribution */}
      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Emotion distribution
        </h2>
        <EmotionBarChart data={session.avgEmotions} height={200} />
      </div>

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
