import Link from "next/link";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS, sentimentFromCounts } from "~/types/analysis";
import {
  NEGATIVE_CLASS,
  NEUTRAL_CLASS,
  POSITIVE_CLASS,
  emotionColorClass,
  sentimentToneClass,
} from "~/lib/sentiment";

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
          {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
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

      {session.status === "COMPLETED" &&
        (() => {
          const b = sentimentFromCounts(session.sentimentCounts);
          const topExprPct = Math.round(
            (session.expressiveEmotions[0]?.confidence ?? 0) * 100,
          );
          return (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
              {session.expressivenessPct === 0 ? (
                <span className="text-gray-500">Mostly neutral</span>
              ) : (
                <span>
                  {EMOTION_EMOJI[session.topExpressiveEmotion] ?? ""}{" "}
                  <span
                    className={`capitalize ${emotionColorClass(session.topExpressiveEmotion)}`}
                  >
                    {session.topExpressiveEmotion} {topExprPct}%
                  </span>
                  <span className="ml-1 text-xs text-gray-400">
                    · {session.expressivenessPct}% expressive
                  </span>
                </span>
              )}
              <span
                className={`capitalize ${sentimentToneClass(session.topSentiment)}`}
              >
                {session.topSentiment}
              </span>
              <span className="text-xs">
                <span className={POSITIVE_CLASS}>{b.positive}% pos</span>
                <span className="text-gray-400"> · </span>
                <span className={NEUTRAL_CLASS}>{b.neutral}% neu</span>
                <span className="text-gray-400"> · </span>
                <span className={NEGATIVE_CLASS}>{b.negative}% neg</span>
              </span>
            </div>
          );
        })()}
    </Link>
  );
}
