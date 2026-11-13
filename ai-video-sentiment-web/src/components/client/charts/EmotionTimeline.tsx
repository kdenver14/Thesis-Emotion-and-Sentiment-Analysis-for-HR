"use client";

import { useState } from "react";
import type { ParsedUtterance } from "~/server/repositories/session";
import {
  EMOTION_HEX as EMOTION_COLORS,
  EMOTION_HEX_DEFAULT as DEFAULT_COLOR,
  sentimentHex,
} from "~/lib/sentiment";
import { formatTimestamp } from "~/lib/dates";
import { splitByTerm } from "~/lib/textSearch";
import { mainScore } from "~/types/analysis";

interface EmotionTimelineProps {
  utterances: ParsedUtterance[];
  employeeSpeakerId?: string | null;
  // Search term to mark in each line's text ("" marks nothing).
  highlight?: string;
}

function Highlighted({ text, term }: { text: string; term: string }) {
  return splitByTerm(text, term).map((part, i) =>
    i % 2 === 1 ? (
      // Gray, not yellow: the UI is monochrome except emotion colors.
      <mark key={i} className="rounded-sm bg-gray-200 px-0.5 text-gray-900">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function topEmotion(utterance: ParsedUtterance): string {
  return mainScore(utterance.emotions)?.label ?? "neutral";
}

// One width for both badge columns, so the header labels sit above them.
const BADGE_COLUMN = "w-[4.5rem] flex-shrink-0 text-center";

function Badge({
  kind,
  label,
  colors,
}: {
  kind: "Emotion" | "Sentiment";
  label: string;
  colors: { bg: string; text: string };
}) {
  return (
    <span
      title={kind}
      className={`${BADGE_COLUMN} rounded px-1.5 py-0.5 text-xs font-medium capitalize`}
      style={{ color: colors.text, backgroundColor: `${colors.bg}20` }}
    >
      <span className="sr-only">{kind}: </span>
      {label}
    </span>
  );
}

export function EmotionTimeline({
  utterances,
  employeeSpeakerId,
  highlight = "",
}: EmotionTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (utterances.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center text-sm text-gray-400">
        No utterances
      </div>
    );
  }

  // Each line names its own emotion, so there is no color strip or legend.
  // Tall enough to read a stretch of the conversation; long lines wrap, so it
  // never scrolls sideways.
  return (
    <div className="flex max-h-[36rem] flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
      {/* Names the two badge columns ("neutral" can be either). Inside the
          scroll box, so a scrollbar never shifts it off the columns. */}
      <div
        aria-hidden
        className="sticky top-0 z-10 hidden justify-end gap-1 bg-white px-2 pb-1 text-xs text-gray-400 sm:flex"
      >
        <span className={BADGE_COLUMN}>Emotion</span>
        <span className={BADGE_COLUMN}>Sentiment</span>
      </div>
      {utterances.map((u) => {
        const emotion = topEmotion(u);
        const sentiment = mainScore(u.sentiments)?.label ?? "neutral";
        const isEmployee =
          u.speaker !== null && u.speaker === employeeSpeakerId;
        const isExpanded = expandedId === u.id;
        return (
          <div key={u.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : u.id)}
              aria-expanded={isExpanded}
              className="flex w-full items-start gap-3 rounded-md px-2 py-1 text-left hover:bg-gray-50"
            >
              <span
                className="mt-1 block h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR)
                    .bg,
                }}
              />
              <span
                className="w-10 flex-shrink-0 text-xs tabular-nums text-gray-500"
                title={`${formatTimestamp(u.startTime)} to ${formatTimestamp(u.endTime)}`}
              >
                {formatTimestamp(u.startTime)}
              </span>
              {u.speaker !== null && (
                <span
                  // Capped so a long renamed speaker cannot squeeze the text
                  // or push the emotion label out of view.
                  title={isEmployee ? "Employee" : u.speaker}
                  className={`max-w-[5rem] flex-shrink-0 truncate rounded px-1.5 py-0.5 text-xs font-medium sm:max-w-[8rem] ${
                    isEmployee
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {isEmployee ? "Employee" : u.speaker}
                </span>
              )}
              <span
                className="min-w-0 flex-1 text-xs font-medium [overflow-wrap:anywhere]"
                style={{
                  color: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).text,
                }}
              >
                <Highlighted text={u.text} term={highlight} />
              </span>
              {/* Stacked on phones, where two badges do not fit beside the text. */}
              <span className="ml-auto flex flex-shrink-0 flex-col gap-1 sm:flex-row">
                <Badge
                  kind="Emotion"
                  label={emotion}
                  colors={EMOTION_COLORS[emotion] ?? DEFAULT_COLOR}
                />
                <Badge
                  kind="Sentiment"
                  label={sentiment}
                  colors={sentimentHex(sentiment)}
                />
              </span>
            </button>

            {isExpanded && (
              <div className="mb-1 ml-7 mr-2 flex flex-col gap-1.5 rounded-md bg-gray-50 px-3 py-2">
                {/* The full time range, reachable by tap and keyboard (the
                    row's tooltip only shows on mouse hover). */}
                <span className="text-xs font-medium text-gray-500">
                  {formatTimestamp(u.startTime)} to {formatTimestamp(u.endTime)}{" "}
                  · Emotion breakdown
                </span>
                {[...u.emotions]
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((e) => {
                    const colors = EMOTION_COLORS[e.label] ?? DEFAULT_COLOR;
                    return (
                      <div key={e.label} className="flex items-center gap-2">
                        <span
                          className="w-16 text-xs font-medium capitalize"
                          style={{ color: colors.text }}
                        >
                          {e.label}
                        </span>
                        <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(e.confidence * 100).toFixed(0)}%`,
                              backgroundColor: colors.bg,
                            }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs text-gray-400">
                          {(e.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
