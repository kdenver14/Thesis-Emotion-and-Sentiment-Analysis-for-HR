"use client";

import { FiActivity } from "react-icons/fi";
import { ExpressiveToggle } from "~/components/client/ExpressiveToggle";
import {
  getSentimentBreakdown,
  type ExpressiveBreakdown,
  type Score,
  type TopEmotionBreakdown,
} from "~/types/analysis";
import {
  NEGATIVE_CLASS,
  NEUTRAL_CLASS,
  POSITIVE_CLASS,
  sentimentToneClass,
} from "~/lib/sentiment";

interface SessionSummaryProps {
  summary: string;
  avgSentiments: Score[];
  expressive: ExpressiveBreakdown;
  allEmotions: TopEmotionBreakdown;
  topSentiment: string;
}

export function SessionSummary({
  summary,
  avgSentiments,
  expressive,
  allEmotions,
  topSentiment,
}: SessionSummaryProps) {
  const breakdown = getSentimentBreakdown(avgSentiments);

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
          <div>
            <div className="flex items-baseline gap-2 text-sm font-medium">
              <span className={POSITIVE_CLASS}>{breakdown.positive}% pos</span>
              <span className="text-gray-300">·</span>
              <span className={NEUTRAL_CLASS}>{breakdown.neutral}% neu</span>
              <span className="text-gray-300">·</span>
              <span className={NEGATIVE_CLASS}>{breakdown.negative}% neg</span>
            </div>
            <div className="text-xs text-gray-500">Sentiment distribution</div>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <ExpressiveToggle
            expressive={expressive}
            allEmotions={allEmotions}
            totalLabel="utterances in session"
            size="sm"
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <div>
            <div
              className={`text-sm font-medium capitalize ${sentimentToneClass(topSentiment)}`}
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
