"use client";

import { useState } from "react";
import type { ParsedUtterance } from "~/server/repositories/session";
import { EmotionTimeline } from "./EmotionTimeline";

const ALL_SPEAKERS = "__all__" as const;

interface SpeakerTimelineProps {
  utterances: ParsedUtterance[];
  speakers: string[];
  employeeSpeakerId?: string | null;
}

export function SpeakerTimeline({
  utterances,
  speakers,
  employeeSpeakerId,
}: SpeakerTimelineProps) {
  const [selected, setSelected] = useState<string>(ALL_SPEAKERS);

  const filtered =
    selected === ALL_SPEAKERS
      ? utterances
      : utterances.filter((u) => u.speaker === selected);

  return (
    <div className="flex flex-col gap-3">
      {speakers.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelected(ALL_SPEAKERS)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              selected === ALL_SPEAKERS
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All speakers
          </button>
          {speakers.map((speaker) => {
            const isEmployee = speaker === employeeSpeakerId;
            const isActive = selected === speaker;
            return (
              <button
                key={speaker}
                onClick={() => setSelected(speaker)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? isEmployee
                      ? "bg-blue-600 text-white"
                      : "bg-gray-900 text-white"
                    : isEmployee
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {isEmployee ? "Employee" : speaker}
              </button>
            );
          })}
        </div>
      )}

      <EmotionTimeline
        utterances={filtered}
        employeeSpeakerId={employeeSpeakerId}
      />
    </div>
  );
}
