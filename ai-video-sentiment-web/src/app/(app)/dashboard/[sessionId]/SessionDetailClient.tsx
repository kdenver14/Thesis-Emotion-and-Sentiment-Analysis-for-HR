"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiTrash2,
  FiDownload,
  FiAlignLeft,
  FiActivity,
  FiClock,
} from "react-icons/fi";
import { removeSession } from "~/actions/sessions";
import { AssignEmployee } from "~/components/client/AssignEmployee";
import { SessionSummary } from "~/components/client/SessionSummary";
import { EmotionBarChart } from "~/components/client/charts/EmotionBarChart";
import { EmotionTimeline } from "~/components/client/charts/EmotionTimeline";
import { ExportButtons } from "~/components/client/ExportButtons";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import type { Score } from "~/types/analysis";

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface Utterance {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  emotions: Score[];
  sentiments: Score[];
}

export interface SerializedSession {
  id: string;
  title: string;
  sessionType: string;
  sessionDateISO: string;
  topEmotion: string;
  topSentiment: string;
  avgEmotions: Score[];
  summary: string;
  engagementScore: number;
  durationSecs: number | null;
  employeeId: string | null;
  employee: { id: string; name: string; department: string | null } | null;
  utterances: Utterance[];
}

type Tab = "overview" | "timeline" | "utterances" | "export";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: FiActivity },
  { key: "timeline", label: "Timeline", icon: FiClock },
  { key: "utterances", label: "Utterances", icon: FiAlignLeft },
  { key: "export", label: "Export", icon: FiDownload },
];

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SessionDetailClient({
  session,
  employees,
}: {
  session: SerializedSession;
  employees: Employee[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");

  const sessionDate = new Date(session.sessionDateISO).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  const sessionTypeLabel =
    SESSION_TYPE_LABELS[session.sessionType as keyof typeof SESSION_TYPE_LABELS] ??
    session.sessionType;

  const handleDelete = async () => {
    setDeleteState("deleting");
    await removeSession(session.id);
    router.push("/dashboard");
  };

  return (
    <div className="flex flex-col gap-0 p-4 sm:p-8">
      {/* Breadcrumb */}
      <Link
        href="/dashboard"
        className="mb-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
      >
        <FiArrowLeft className="h-3 w-3" /> Back to Dashboard
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-gray-900">{session.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>{sessionDate}</span>
            <span className="text-gray-300">·</span>
            <span>{sessionTypeLabel}</span>
            <span className="text-gray-300">·</span>
            <AssignEmployee
              sessionId={session.id}
              employees={employees}
              current={session.employee}
            />
            {session.durationSecs !== null && (
              <>
                <span className="text-gray-300">·</span>
                <span>{session.durationSecs.toFixed(0)}s</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {deleteState === "idle" && (
            <button
              onClick={() => setDeleteState("confirm")}
              className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              <FiTrash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          {deleteState === "confirm" && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5">
              <span className="text-xs text-red-700">Delete this session?</span>
              <button
                onClick={handleDelete}
                className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setDeleteState("idle")}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          )}
          {deleteState === "deleting" && (
            <span className="text-xs text-gray-400">Deleting…</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-0 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-slate-700 text-slate-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-5">
          <SessionSummary
            summary={session.summary}
            engagementScore={session.engagementScore}
            topEmotion={session.topEmotion}
            topSentiment={session.topSentiment}
          />
          <div className="card p-5">
            <h2 className="mb-4 text-sm font-medium text-gray-700">
              Emotion distribution
            </h2>
            <EmotionBarChart data={session.avgEmotions} height={200} />
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-700">
            Utterance timeline
          </h2>
          <EmotionTimeline utterances={session.utterances} />
        </div>
      )}

      {activeTab === "utterances" && (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-medium text-gray-700">
              {session.utterances.length} utterances
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {session.utterances.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No utterances recorded.</p>
            ) : (
              session.utterances.map((u) => {
                const topEmotion = u.emotions[0];
                const topSentiment = u.sentiments[0];
                return (
                  <div key={u.id} className="flex flex-col gap-1.5 px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <p className="flex-1 text-sm text-gray-800">{u.text}</p>
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">
                        {formatTime(u.startTime)} – {formatTime(u.endTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {topEmotion && (
                        <span className="badge badge-neutral capitalize">
                          {topEmotion.label}
                          <span className="ml-1 opacity-60">
                            {Math.round(topEmotion.confidence * 100)}%
                          </span>
                        </span>
                      )}
                      {topSentiment && (
                        <StatusBadge
                          status={topSentiment.label as "positive" | "neutral" | "negative"}
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === "export" && (
        <div className="card flex flex-col gap-6 p-6">
          <div>
            <h2 className="text-sm font-medium text-gray-800">Export session data</h2>
            <p className="mt-1 text-sm text-gray-500">
              Download a full record of this assessment session including utterances,
              emotion scores, and the AI-generated summary.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4 rounded-lg border border-gray-200 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">CSV export</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Spreadsheet-compatible format. Includes all utterances with timestamps,
                  emotion probabilities, and sentiment labels.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-lg border border-gray-200 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">PDF report</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Printable summary report with the AI analysis, engagement score,
                  emotion breakdown, and key highlights.
                </p>
              </div>
            </div>
            <ExportButtons sessionId={session.id} />
          </div>
        </div>
      )}
    </div>
  );
}
