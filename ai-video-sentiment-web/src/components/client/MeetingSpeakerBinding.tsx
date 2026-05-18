"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { bindMeetingParticipantSpeaker } from "~/actions/sessions";
import type { SessionParticipantRow } from "~/server/repositories/session";

interface MeetingSpeakerBindingProps {
  sessionId: string;
  speakers: string[];
  participants: SessionParticipantRow[];
  canMutate: boolean;
}

const UNASSIGNED = "";

export function MeetingSpeakerBinding({
  sessionId,
  speakers,
  participants,
  canMutate,
}: MeetingSpeakerBindingProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (speakers.length === 0 || participants.length === 0) return null;

  function holderOf(speaker: string): SessionParticipantRow | undefined {
    return participants.find((p) => p.speakerLabel === speaker);
  }

  function handleChange(speaker: string, employeeId: string) {
    startTransition(async () => {
      if (employeeId === UNASSIGNED) {
        const holder = holderOf(speaker);
        if (holder) {
          await bindMeetingParticipantSpeaker(sessionId, holder.employeeId, null);
        }
      } else {
        await bindMeetingParticipantSpeaker(sessionId, employeeId, speaker);
      }
      router.refresh();
    });
  }

  const unbound = participants.filter((p) => p.speakerLabel === null);

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h2 className="mb-1 text-sm font-medium text-gray-700">
        Participant identification
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Map each detected speaker to a meeting participant. Analytics for an
        employee use only their mapped speaker&apos;s utterances.
      </p>
      <div className="flex flex-col divide-y divide-gray-100">
        {speakers.map((speaker) => {
          const current = holderOf(speaker);
          return (
            <div
              key={speaker}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="text-sm text-gray-900">{speaker}</span>
              <select
                disabled={!canMutate || isPending}
                value={current?.employeeId ?? UNASSIGNED}
                onChange={(e) => handleChange(speaker, e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none disabled:opacity-50"
              >
                <option value={UNASSIGNED}>— unassigned —</option>
                {participants.map((p) => (
                  <option key={p.employeeId} value={p.employeeId}>
                    {p.employeeName}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {unbound.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Not yet mapped: {unbound.map((p) => p.employeeName).join(", ")}
        </p>
      )}
    </div>
  );
}
