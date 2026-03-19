"use client";

import { FiActivity } from "react-icons/fi";
import { ScoreBadge } from "~/components/ui/ScoreBadge";
import { StatusBadge } from "~/components/ui/StatusBadge";

interface SessionSummaryProps {
  summary: string;
  engagementScore: number;
  topEmotion: string;
  topSentiment: string;
}

export function SessionSummary({
  summary,
  engagementScore,
  topEmotion,
  topSentiment,
}: SessionSummaryProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-800">Session Summary</h3>
        <div className="flex items-center gap-1.5">
          <FiActivity className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500">AI-generated analysis</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-500">Engagement</div>
          <ScoreBadge score={engagementScore} size="lg" />
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-500">Top emotion</div>
          <span className="text-sm font-medium capitalize text-gray-800">
            {topEmotion}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-500">Sentiment</div>
          <StatusBadge
            status={topSentiment as "positive" | "neutral" | "negative"}
          />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-gray-600">{summary}</p>
    </div>
  );
}
