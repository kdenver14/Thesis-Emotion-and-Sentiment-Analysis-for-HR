import Link from "next/link";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS } from "~/types/analysis";

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

interface Props {
  session: ParsedSession;
}

export function LatestSessionCard({ session }: Props) {
  return (
    <Link
      href={`/dashboard/${session.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-gray-200 p-5 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Latest session
          </p>
          <p className="mt-0.5 truncate text-base font-medium text-gray-900">
            {session.title}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-gray-400">
            {session.sessionDate.toLocaleDateString("en-GB")}
          </span>
          <span className="text-xs text-gray-400 group-hover:text-gray-700">
            Open →
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="rounded-full border border-gray-200 px-2 py-0.5">
          {SESSION_TYPE_LABELS[
            session.sessionType as keyof typeof SESSION_TYPE_LABELS
          ] ?? session.sessionType}
        </span>
        {session.employee && (
          <span>
            {session.employee.name}
            {session.employee.department
              ? ` · ${session.employee.department}`
              : ""}
          </span>
        )}
        {session.status === "PROCESSING" && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
            Processing
          </span>
        )}
        {session.status === "FAILED" && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
            Failed
          </span>
        )}
      </div>

      {session.status === "COMPLETED" && (
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            {EMOTION_EMOJI[session.topEmotion] ?? ""}{" "}
            <span className="capitalize">{session.topEmotion}</span>
          </span>
          <span className="capitalize text-gray-500">{session.topSentiment}</span>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-20 rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-gray-800"
                style={{ width: `${session.engagementScore}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {session.engagementScore}/100
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
