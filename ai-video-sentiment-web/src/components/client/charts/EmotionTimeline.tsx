"use client";

import { useState } from "react";
import type { ParsedUtterance } from "~/server/repositories/session";
import {
  EMOTION_HEX as EMOTION_COLORS,
  EMOTION_HEX_DEFAULT as DEFAULT_COLOR,
} from "~/lib/sentiment";

interface EmotionTimelineProps {
  utterances: ParsedUtterance[];
  employeeSpeakerId?: string | null;
}

function topEmotion(utterance: ParsedUtterance): string {
  return (
    [...utterance.emotions].sort((a, b) => b.confidence - a.confidence)[0]
      ?.label ?? "neutral"
  );
}

export function EmotionTimeline({ utterances, employeeSpeakerId }: EmotionTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (utterances.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center text-sm text-gray-400">
        No utterances
      </div>
    );
  }

  const totalDuration =
    utterances.at(-1)?.endTime ?? utterances.at(-1)?.startTime ?? 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Visual strip */}
      <div className="flex h-8 w-full overflow-hidden rounded-md">
        {utterances.map((u) => {
          const emotion = topEmotion(u);
          const widthPct = ((u.endTime - u.startTime) / totalDuration) * 100;
          return (
            <div
              key={u.id}
              title={`${u.startTime.toFixed(1)}s–${u.endTime.toFixed(1)}s: ${emotion}\n"${u.text}"`}
              style={{
                width: `${widthPct}%`,
                backgroundColor: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).bg,
                minWidth: 2,
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EMOTION_COLORS).map(([label, { bg }]) => (
          <div key={label} className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: bg }}
            />
            <span className="text-xs capitalize text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Utterance list */}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {utterances.map((u) => {
          const emotion = topEmotion(u);
          const isEmployee = u.speaker !== null && u.speaker === employeeSpeakerId;
          const isExpanded = expandedId === u.id;
          return (
            <div key={u.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : u.id)}
                className="flex w-full items-start gap-3 rounded-md px-2 py-1 text-left hover:bg-gray-50"
              >
                <div
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).bg }}
                />
                <span className="w-20 flex-shrink-0 text-xs text-gray-400">
                  {u.startTime.toFixed(1)}–{u.endTime.toFixed(1)}s
                </span>
                {u.speaker !== null && (
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                      isEmployee
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {isEmployee ? "Employee" : u.speaker}
                  </span>
                )}
                <span
                  className="text-xs font-medium"
                  style={{ color: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).text }}
                >
                  {u.text}
                </span>
                <span
                  className="ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-xs capitalize font-medium"
                  style={{
                    color: (EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).text,
                    backgroundColor: `${(EMOTION_COLORS[emotion] ?? DEFAULT_COLOR).bg}20`,
                  }}
                >
                  {emotion}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-7 mr-2 mb-1 flex flex-col gap-1.5 rounded-md bg-gray-50 px-3 py-2">
                  <span className="text-xs font-medium text-gray-500">
                    Emotion breakdown
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
    </div>
  );
}
