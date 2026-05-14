"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowUp, FiArrowDown, FiTrash2, FiSearch, FiX } from "react-icons/fi";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS, getSentimentBreakdown } from "~/types/analysis";
import { removeSessionsBulk } from "~/actions/sessions";

type SortKey =
  | "sessionDate"
  | "title"
  | "topSentiment"
  | "employee"
  | "sessionType";
type SortDir = "asc" | "desc";

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  negative: "bg-red-100 text-red-700",
};

const EMOTION_EMOJI: Record<string, string> = {
  anger: "😡",
  disgust: "🤢",
  fear: "😨",
  joy: "😄",
  neutral: "😐",
  sadness: "😢",
  surprise: "😲",
};

interface SessionTableProps {
  sessions: ParsedSession[];
  seesAllUsers?: boolean;
  canMutate?: boolean;
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={className}
    />
  );
}

export function SessionTable({ sessions, seesAllUsers = false, canMutate = false }: SessionTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("sessionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const showHandledBy =
    seesAllUsers || new Set(sessions.map((s) => s.handledBy.id)).size > 1;
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const typeOptions = Array.from(
    new Set(sessions.map((s) => s.sessionType)),
  ).sort();
  const [isBulkDeleting, startBulkTransition] = useTransition();

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "sessionDate", label: "Date" },
    { value: "title", label: "Title" },
    { value: "sessionType", label: "Type" },
    { value: "employee", label: "Employee" },
    { value: "topSentiment", label: "Sentiment" },
  ];

  const byType =
    typeFilter === "all"
      ? sessions
      : sessions.filter((s) => s.sessionType === typeFilter);

  const query = search.toLowerCase();
  const filtered = query
    ? byType.filter((s) => {
        const typeLabel =
          SESSION_TYPE_LABELS[
            s.sessionType as keyof typeof SESSION_TYPE_LABELS
          ] ?? s.sessionType;
        const haystack = [
          s.title,
          s.sessionDate.toLocaleDateString("en-GB"),
          s.handledBy.name ?? "",
          s.sessionType,
          typeLabel,
          s.employee?.name ?? "",
          s.topExpressiveEmotion,
          s.topSentiment,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : byType;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "sessionDate") {
      cmp = a.sessionDate.getTime() - b.sessionDate.getTime();
    } else if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (sortKey === "topSentiment") {
      cmp = a.topSentiment.localeCompare(b.topSentiment);
    } else if (sortKey === "employee") {
      cmp = (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "");
    } else if (sortKey === "sessionType") {
      const al =
        SESSION_TYPE_LABELS[
          a.sessionType as keyof typeof SESSION_TYPE_LABELS
        ] ?? a.sessionType;
      const bl =
        SESSION_TYPE_LABELS[
          b.sessionType as keyof typeof SESSION_TYPE_LABELS
        ] ?? b.sessionType;
      cmp = al.localeCompare(bl);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const sortedIds = sorted.map((s) => s.id);
  const selectedInView = sortedIds.filter((id) => selected.has(id));
  const allChecked = sortedIds.length > 0 && selectedInView.length === sortedIds.length;
  const someChecked = selectedInView.length > 0 && !allChecked;

  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        sortedIds.forEach((id) => next.add(id));
      } else {
        sortedIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} session${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    startBulkTransition(async () => {
      await removeSessionsBulk(ids);
      setSelected(new Set());
      router.refresh();
    });
  };

  const th =
    "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide";

  return (
    <div className="flex flex-col gap-3">
      {/* Search + sort */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by session name or employee…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-8 text-sm text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="session-type-filter"
            className="text-xs uppercase tracking-wide text-gray-500"
          >
            Type
          </label>
          <select
            id="session-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="all">All types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {SESSION_TYPE_LABELS[t as keyof typeof SESSION_TYPE_LABELS] ?? t}
              </option>
            ))}
          </select>
          <label
            htmlFor="session-sort-key"
            className="text-xs uppercase tracking-wide text-gray-500"
          >
            Sort by
          </label>
          <select
            id="session-sort-key"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {sortDir === "asc" ? (
              <FiArrowUp className="h-3.5 w-3.5" />
            ) : (
              <FiArrowDown className="h-3.5 w-3.5" />
            )}
            <span className="text-xs uppercase tracking-wide text-gray-500">
              {sortDir === "asc" ? "Asc" : "Desc"}
            </span>
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {canMutate && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-sm text-gray-600">
            {selected.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            {isBulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {canMutate && (
                <th className="w-10 px-4 py-3">
                  <IndeterminateCheckbox
                    checked={allChecked}
                    indeterminate={someChecked}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300"
                  />
                </th>
              )}
              <th className={th}>Date</th>
              {showHandledBy && <th className={th}>Handled by</th>}
              <th className={th}>Title</th>
              <th className={th}>Type</th>
              <th className={th}>Employee</th>
              <th className={th}>Emotion</th>
              <th className={th}>Sentiment</th>
              <th className={th}>Sentiment %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7 + (canMutate ? 1 : 0) + (showHandledBy ? 1 : 0)} className="px-4 py-8 text-center text-gray-400">
                  {search || typeFilter !== "all"
                    ? "No sessions match your filters"
                    : "No sessions yet"}
                </td>
              </tr>
            ) : (
              sorted.map((s) => (
                <tr
                  key={s.id}
                  className={`hover:bg-gray-50 ${selected.has(s.id) ? "bg-gray-50" : ""}`}
                >
                  {canMutate && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) => toggleOne(s.id, e.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex flex-col">
                      <span>{s.sessionDate.toLocaleDateString("en-GB")}</span>
                      <span className="text-xs text-gray-400">Uploaded {s.createdAt.toLocaleDateString("en-GB")}</span>
                    </div>
                  </td>
                  {showHandledBy && (
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                        {s.handledBy.name ?? "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/${s.id}`} className="hover:text-gray-600 hover:underline">
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {SESSION_TYPE_LABELS[
                      s.sessionType as keyof typeof SESSION_TYPE_LABELS
                    ] ?? s.sessionType}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-gray-500">
                      {s.employee?.name ?? "—"}
                      {s.employee?.status === "Deleted" && (
                        <span className="ml-1 text-xs text-gray-400">(deleted)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.status !== "COMPLETED" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : s.expressivenessPct === 0 ? (
                      <span className="text-xs text-gray-500">mostly neutral</span>
                    ) : (
                      <div className="flex flex-col">
                        <span className="capitalize">
                          {EMOTION_EMOJI[s.topExpressiveEmotion] ?? ""}{" "}
                          {s.topExpressiveEmotion}{" "}
                          {Math.round(
                            (s.expressiveEmotions[0]?.confidence ?? 0) * 100,
                          )}
                          %
                        </span>
                        <span className="text-xs text-gray-400">
                          {s.expressivenessPct}% expressive
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "PROCESSING" ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Processing
                      </span>
                    ) : s.status === "FAILED" ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                        Failed
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT_BADGE[s.topSentiment] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {s.topSentiment}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "PROCESSING" || s.status === "FAILED" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      (() => {
                        const b = getSentimentBreakdown(s.avgSentiments);
                        return (
                          <span className="whitespace-nowrap text-xs text-gray-600">
                            {b.positive}% pos
                            <span className="mx-1 text-gray-300">·</span>
                            {b.neutral}% neu
                            <span className="mx-1 text-gray-300">·</span>
                            {b.negative}% neg
                          </span>
                        );
                      })()
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
