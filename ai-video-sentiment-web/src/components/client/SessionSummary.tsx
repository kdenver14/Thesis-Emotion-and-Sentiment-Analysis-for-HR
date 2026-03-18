"use client";

import { FiTrendingUp, FiTrendingDown, FiMinus, FiActivity } from "react-icons/fi";

interface SessionSummaryProps {
  summary: string;
  engagementScore: number;
  topEmotion: string;
  topSentiment: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "text-green-600",
  neutral: "text-gray-500",
  negative: "text-red-600",
};

const ENGAGEMENT_COLOR = (score: number) => {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
};

const ENGAGEMENT_BG = (score: number) => {
  if (score >= 70) return "bg-green-100";
  if (score >= 40) return "bg-yellow-100";
  return "bg-red-100";
};

export function SessionSummary({
  summary,
  engagementScore,
  topEmotion,
  topSentiment,
}: SessionSummaryProps) {
  const TrendIcon =
    summary.includes("improved") ? FiTrendingUp
    : summary.includes("declined") ? FiTrendingDown
    : FiMinus;

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
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 ${ENGAGEMENT_BG(engagementScore)}`}
        >
          <TrendIcon
            className={`h-4 w-4 ${ENGAGEMENT_COLOR(engagementScore)}`}
          />
          <div>
            <div
              className={`text-lg font-semibold ${ENGAGEMENT_COLOR(engagementScore)}`}
            >
              {engagementScore}
              <span className="text-sm font-normal">/100</span>
            </div>
            <div className="text-xs text-gray-500">Engagement score</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <div>
            <div className="text-sm font-medium capitalize text-gray-800">
              {topEmotion}
            </div>
            <div className="text-xs text-gray-500">Top emotion</div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <div>
            <div
              className={`text-sm font-medium capitalize ${SENTIMENT_COLORS[topSentiment] ?? "text-gray-800"}`}
            >
              {topSentiment}
            </div>
            <div className="text-xs text-gray-500">Overall sentiment</div>
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-gray-600">{summary}</p>
    </div>
  );
}
