"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEmployeeSpeaker } from "~/actions/sessions";

interface SpeakerLabelProps {
  sessionId: string;
  speakers: string[];
  employeeSpeakerId: string | null;
}

export function SpeakerLabel({
  sessionId,
  speakers,
  employeeSpeakerId,
}: SpeakerLabelProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (speakers.length === 0) return null;

  function handleSelect(speaker: string) {
    const next = speaker === employeeSpeakerId ? null : speaker;
    startTransition(async () => {
      await setEmployeeSpeaker(sessionId, next);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h2 className="mb-3 text-sm font-medium text-gray-700">
        Speaker identification
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Select which speaker is the employee. Their utterances will be
        highlighted in the timeline.
      </p>
      <div className="flex flex-wrap gap-2">
        {speakers.map((speaker) => {
          const isSelected = speaker === employeeSpeakerId;
          return (
            <button
              key={speaker}
              disabled={isPending}
              onClick={() => handleSelect(speaker)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                isSelected
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {isSelected ? `${speaker} — Employee` : speaker}
            </button>
          );
        })}
      </div>
    </div>
  );
}
