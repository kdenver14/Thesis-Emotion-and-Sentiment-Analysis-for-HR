"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2, FiCheck, FiX } from "react-icons/fi";
import type { ParsedUtterance } from "~/server/repositories/session";
import { renameSessionSpeaker } from "~/actions/sessions";
import { EmotionTimeline } from "./EmotionTimeline";

const ALL_SPEAKERS = "__all__" as const;

interface SpeakerTimelineProps {
  sessionId: string;
  utterances: ParsedUtterance[];
  speakers: string[];
  employeeSpeakerId?: string | null;
}

function EditableSpeakerName({
  speaker,
  sessionId,
  isEmployee,
  onRenamed,
}: {
  speaker: string;
  sessionId: string;
  isEmployee: boolean;
  onRenamed: (oldName: string, newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(speaker);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleSave() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === speaker) {
      setValue(speaker);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await renameSessionSpeaker(sessionId, speaker, trimmed);
      onRenamed(speaker, trimmed);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setValue(speaker);
              setEditing(false);
            }
          }}
          disabled={isPending}
          className="w-28 rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-gray-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
        >
          <FiCheck className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            setValue(speaker);
            setEditing(false);
          }}
          disabled={isPending}
          className="rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
        >
          <FiX className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
      title={`Rename ${isEmployee ? "Employee" : speaker}`}
    >
      <FiEdit2 className="h-3 w-3" />
    </button>
  );
}

export function SpeakerTimeline({
  sessionId,
  utterances,
  speakers: initialSpeakers,
  employeeSpeakerId,
}: SpeakerTimelineProps) {
  const [selected, setSelected] = useState<string>(ALL_SPEAKERS);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const router = useRouter();

  function handleRenamed(oldName: string, newName: string) {
    setSpeakers((prev) =>
      prev.map((s) => (s === oldName ? newName : s)),
    );
    if (selected === oldName) setSelected(newName);
    router.refresh();
  }

  const filtered =
    selected === ALL_SPEAKERS
      ? utterances
      : utterances.filter((u) => u.speaker === selected);

  return (
    <div className="flex flex-col gap-3">
      {speakers.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
              <div key={speaker} className="flex items-center gap-0.5">
                <button
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
                <EditableSpeakerName
                  speaker={speaker}
                  sessionId={sessionId}
                  isEmployee={isEmployee}
                  onRenamed={handleRenamed}
                />
              </div>
            );
          })}
        </div>
      )}

      {speakers.length <= 1 && speakers.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Speaker: {speakers[0]}
          </span>
          <EditableSpeakerName
            speaker={speakers[0]!}
            sessionId={sessionId}
            isEmployee={speakers[0] === employeeSpeakerId}
            onRenamed={handleRenamed}
          />
        </div>
      )}

      <EmotionTimeline
        utterances={filtered}
        employeeSpeakerId={employeeSpeakerId}
      />
    </div>
  );
}
