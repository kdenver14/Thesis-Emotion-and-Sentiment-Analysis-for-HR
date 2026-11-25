"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FiEdit2, FiCheck, FiSearch, FiX } from "react-icons/fi";
import type { ParsedUtterance } from "~/server/repositories/session";
import { mainScore, SENTIMENT_LABELS } from "~/types/analysis";
import { EMOTION_HEX } from "~/lib/sentiment";
import { renameSessionSpeaker } from "~/actions/sessions";
import { containsTerm } from "~/lib/textSearch";
import { EmotionTimeline } from "./EmotionTimeline";
import { FULL_NAME_MAX, SEARCH_MAX } from "~/lib/inputLimits";

const ALL_SPEAKERS = "__all__";

// Set by the session summary's legend links (?sentiment= / ?emotion=): show
// only the lines whose main sentiment or emotion is that label.
type LabelFilter = { kind: "sentiment" | "emotion"; label: string };

function readLabelFilter(params: URLSearchParams): LabelFilter | null {
  const sentiment = params.get("sentiment");
  const known = SENTIMENT_LABELS.find((l) => l === sentiment);
  if (known) return { kind: "sentiment", label: known };
  const emotion = params.get("emotion");
  if (emotion && Object.hasOwn(EMOTION_HEX, emotion)) {
    return { kind: "emotion", label: emotion };
  }
  return null;
}

interface SpeakerTimelineProps {
  sessionId: string;
  utterances: ParsedUtterance[];
  speakers: string[];
  employeeSpeakerId?: string | null;
  canMutate?: boolean;
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
          maxLength={FULL_NAME_MAX}
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
  canMutate = false,
}: SpeakerTimelineProps) {
  const [selected, setSelected] = useState<string>(ALL_SPEAKERS);
  const [speakers, setSpeakers] = useState(initialSpeakers);
  const router = useRouter();

  function handleRenamed(oldName: string, newName: string) {
    setSpeakers((prev) => prev.map((s) => (s === oldName ? newName : s)));
    if (selected === oldName) setSelected(newName);
    router.refresh();
  }

  // Search lets HR find a moment by a word they remember from the session.
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const pathname = usePathname();
  const labelFilter = readLabelFilter(useSearchParams());
  const filtered = utterances.filter(
    (u) =>
      (selected === ALL_SPEAKERS || u.speaker === selected) &&
      containsTerm(u.text, term) &&
      (!labelFilter ||
        mainScore(labelFilter.kind === "sentiment" ? u.sentiments : u.emotions)
          ?.label === labelFilter.label),
  );
  const narrowed = Boolean(term || labelFilter);
  const lines = filtered.length === 1 ? "1 line" : `${filtered.length} lines`;
  const status = term
    ? `${lines} ${filtered.length === 1 ? "mentions" : "mention"} \u201c${term}\u201d`
    : lines;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {speakers.length > 0 && (
          <div className="min-w-0">
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
                      {canMutate && (
                        <EditableSpeakerName
                          speaker={speaker}
                          sessionId={sessionId}
                          isEmployee={isEmployee}
                          onRenamed={handleRenamed}
                        />
                      )}
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
                {canMutate && (
                  <EditableSpeakerName
                    speaker={speakers[0]!}
                    sessionId={sessionId}
                    isEmployee={speakers[0] === employeeSpeakerId}
                    onRenamed={handleRenamed}
                  />
                )}
              </div>
            )}
          </div>
        )}
        <div className="relative sm:ml-auto sm:w-64 sm:flex-shrink-0">
          <FiSearch
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            maxLength={SEARCH_MAX}
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the transcript"
            aria-label="Search the transcript"
            className="w-full rounded-md border border-gray-200 py-1.5 pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Always mounted so screen readers announce the first count too. */}
      <div
        aria-live="polite"
        className={
          narrowed
            ? "flex flex-wrap items-center gap-2 text-xs text-gray-500"
            : "sr-only"
        }
      >
        {narrowed && <span>{status}</span>}
        {labelFilter && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-gray-700">
            <span className="capitalize">{labelFilter.label}</span>{" "}
            {labelFilter.kind}
            <button
              type="button"
              onClick={() => {
                router.replace(pathname, { scroll: false });
                // The button removes itself; keep keyboard focus nearby.
                searchRef.current?.focus();
              }}
              aria-label={`Clear the ${labelFilter.label} filter`}
              className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              <FiX className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </div>
      {!(narrowed && filtered.length === 0) && (
        <EmotionTimeline
          utterances={filtered}
          employeeSpeakerId={employeeSpeakerId}
          highlight={term}
        />
      )}
    </div>
  );
}
