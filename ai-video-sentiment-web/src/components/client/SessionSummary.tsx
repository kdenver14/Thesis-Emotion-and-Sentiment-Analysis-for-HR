"use client";

import { FiTrendingUp, FiTrendingDown, FiMinus, FiActivity } from "react-icons/fi";
import {
  getSentimentBreakdown,
  type ExpressiveBreakdown,
  type Score,
} from "~/types/analysis";

interface SessionSummaryProps {
  summary: string;
  avgSentiments: Score[];
  expressive: ExpressiveBreakdown;
  topSentiment: string;
}

export function SessionSummary({
  summary,
  avgSentiments,
  expressive,
  topSentiment,
}: SessionSummaryProps) {
  const TrendIcon =
    summary.includes("improved") ? FiTrendingUp
    : summary.includes("declined") ? FiTrendingDown
    : FiMinus;
  const breakdown = getSentimentBreakdown(avgSentiments);
  const topExprPct = Math.round(
    (expressive.expressiveEmotions[0]?.confidence ?? 0) * 100,
  );

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
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <TrendIcon className="h-4 w-4 text-gray-500" />
          <div>
            <div className="flex items-baseline gap-2 text-sm font-medium text-gray-800">
              <span>{breakdown.positive}% pos</span>
              <span className="text-gray-300">·</span>
              <span>{breakdown.neutral}% neu</span>
              <span className="text-gray-300">·</span>
              <span>{breakdown.negative}% neg</span>
            </div>
            <div className="text-xs text-gray-500">Sentiment distribution</div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 rounded-lg bg-gray-50 px-3 py-2">
          {expressive.expressivenessPct === 0 ? (
            <div className="text-sm font-medium text-gray-800">Mostly neutral</div>
          ) : (
            <div className="text-sm font-medium capitalize text-gray-800">
              {expressive.topExpressiveEmotion} {topExprPct}%
            </div>
          )}
          <div className="text-xs text-gray-500">
            {expressive.expressivenessPct}% expressive · top expressive emotion
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <div>
            <div className="text-sm font-medium capitalize text-gray-800">
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
