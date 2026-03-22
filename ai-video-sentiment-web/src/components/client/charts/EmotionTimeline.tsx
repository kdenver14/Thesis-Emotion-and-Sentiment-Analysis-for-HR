"use client";

import type { ParsedUtterance } from "~/server/repositories/session";

const EMOTION_COLORS: Record<string, string> = {
  anger: "#ef4444",
  disgust: "#a855f7",
  fear: "#f97316",
  joy: "#22c55e",
  neutral: "#6b7280",
  sadness: "#3b82f6",
  surprise: "#eab308",
};

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
                backgroundColor: EMOTION_COLORS[emotion] ?? "#6b7280",
                minWidth: 2,
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EMOTION_COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: color }}
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
          return (
            <div
              key={u.id}
              className="flex items-start gap-3 rounded-md px-2 py-1 hover:bg-gray-50"
            >
              <div
                className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: EMOTION_COLORS[emotion] ?? "#6b7280" }}
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
              <span className="text-xs text-gray-700">{u.text}</span>
              <span className="ml-auto flex-shrink-0 text-xs capitalize text-gray-500">
                {emotion}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
