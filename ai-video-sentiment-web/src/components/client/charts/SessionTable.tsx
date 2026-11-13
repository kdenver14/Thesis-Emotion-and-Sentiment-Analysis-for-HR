"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiArrowUp,
  FiArrowDown,
  FiTrash2,
  FiSearch,
  FiX,
} from "react-icons/fi";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import { emotionColorClass } from "~/lib/sentiment";
import { ARCHIVED_STATUS } from "~/schemas/employee";
import { removeSessionsBulk } from "~/actions/sessions";
import { useConfirm } from "~/components/client/ConfirmDialog";

type SortKey =
  | "sessionDate"
  | "title"
  | "topSentiment"
  | "employee"
  | "sessionType";
type SortDir = "asc" | "desc";

// Meetings list their participants; past this many the cell says "+N more".
const MAX_ATTENDEES_SHOWN = 2;

// The Employee column's text: the one employee, or a meeting's participants.
function employeeLabel(s: ParsedSession): string {
  return s.employee?.name ?? s.attendeeNames.join(", ");
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral: "bg-gray-100 text-gray-600",
  negative: "bg-red-100 text-red-700",
};

interface SessionTableProps {
  sessions: ParsedSession[];
  seesAllUsers?: boolean;
  canMutate?: boolean;
  // Active session-type scope, resolved on the server from the ?type= search
  // param so a shared URL deep-links to the same filter. "all" means no
  // filter. The server has already validated the value against SESSION_TYPES.
  // The control itself lives in the dashboard toolbar (SessionTypeFilter),
  // because it also scopes the emotion donut and the trend chart.
  typeFilter?: string;
  // Employee page: every row is that employee, so the column is redundant.
  hideEmployee?: boolean;
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

export function SessionTable({
  sessions,
  seesAllUsers = false,
  canMutate = false,
  typeFilter = "all",
  hideEmployee = false,
}: SessionTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("sessionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const showHandledBy =
    seesAllUsers ||
    new Set(sessions.map((s) => s.handledBy?.id ?? "")).size > 1;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [isBulkDeleting, startBulkTransition] = useTransition();
  const { confirm } = useConfirm();

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "sessionDate", label: "Date" },
    { value: "title", label: "Title" },
    { value: "sessionType", label: "Type" },
    ...(hideEmployee
      ? []
      : [{ value: "employee" as const, label: "Employee" }]),
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
            s.sessionType
          ] ?? s.sessionType;
        const haystack = [
          s.title,
          s.sessionDate.toLocaleDateString("en-GB"),
          s.handledBy?.name ?? "",
          s.sessionType,
          typeLabel,
          employeeLabel(s),
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
      cmp = employeeLabel(a).localeCompare(employeeLabel(b));
    } else if (sortKey === "sessionType") {
      const al =
        SESSION_TYPE_LABELS[
          a.sessionType
        ] ?? a.sessionType;
      const bl =
        SESSION_TYPE_LABELS[
          b.sessionType
        ] ?? b.sessionType;
      cmp = al.localeCompare(bl);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const sortedIds = sorted.map((s) => s.id);
  const selectedInView = sortedIds.filter((id) => selected.has(id));
  const allChecked =
    sortedIds.length > 0 && selectedInView.length === sortedIds.length;
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

  const handleBulkDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      message: `Delete ${ids.length} session${ids.length > 1 ? "s" : ""}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startBulkTransition(async () => {
      await removeSessionsBulk(ids);
      setSelected(new Set());
      router.refresh();
    });
  };

  const th = "px-4 py-3 text-left text-xs font-medium text-gray-500";

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
            placeholder={
              hideEmployee
                ? "Search sessions…"
                : "Search by session name or employee…"
            }
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
        {/* The select states its own meaning ("Sort: Date"), so no floating
            uppercase label is needed beside it. The session-type filter is a
            page-level control and lives in the dashboard toolbar instead. */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="session-sort-key"
            aria-label="Sort by"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
            title={sortDir === "asc" ? "Ascending" : "Descending"}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50"
          >
            {sortDir === "asc" ? (
              <FiArrowUp className="h-3.5 w-3.5" />
            ) : (
              <FiArrowDown className="h-3.5 w-3.5" />
            )}
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
              <th className={th}>Title</th>
              <th className={th}>Date</th>
              <th className={th}>Type</th>
              {!hideEmployee && <th className={th}>Employee</th>}
              <th className={th}>Emotion</th>
              <th className={th}>Sentiment</th>
              {showHandledBy && <th className={th}>Handled by</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    (hideEmployee ? 5 : 6) +
                    (canMutate ? 1 : 0) +
                    (showHandledBy ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-gray-400"
                >
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
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/dashboard/${s.id}`}
                      className="hover:underline"
                    >
                      {s.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {s.sessionDate.toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {SESSION_TYPE_LABELS[
                      s.sessionType
                    ] ?? s.sessionType}
                  </td>
                  {!hideEmployee && (
                    <td className="px-4 py-3">
                      {!s.employee && s.attendeeNames.length > 0 ? (
                        <span
                          className="text-gray-500"
                          title={employeeLabel(s)}
                        >
                          {s.attendeeNames
                            .slice(0, MAX_ATTENDEES_SHOWN)
                            .join(", ")}
                          {s.attendeeNames.length > MAX_ATTENDEES_SHOWN && (
                            <span className="ml-1 text-xs text-gray-400">
                              +{s.attendeeNames.length - MAX_ATTENDEES_SHOWN}{" "}
                              more
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          {s.employee?.name ?? "—"}
                          {s.employee?.status === ARCHIVED_STATUS && (
                            <span className="ml-1 text-xs text-gray-400">
                              (archived)
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {s.status !== "COMPLETED" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : s.expressivenessPct === 0 ? (
                      <span className="text-xs text-gray-500">
                        mostly neutral
                      </span>
                    ) : (
                      <span
                        className={`whitespace-nowrap capitalize ${emotionColorClass(
                          s.topExpressiveEmotion,
                        )}`}
                      >
                        {s.topExpressiveEmotion}{" "}
                        {Math.round(
                          (s.expressiveEmotions[0]?.confidence ?? 0) * 100,
                        )}
                        %
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "UPLOADING" ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Uploading
                      </span>
                    ) : s.status === "PROCESSING" ? (
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
                  {showHandledBy && (
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {s.handledBy?.name ?? "—"}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
