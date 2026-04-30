"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiChevronUp, FiChevronDown, FiEdit2, FiTrash2, FiSearch, FiX } from "react-icons/fi";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import { assignSessionEmployee, renameSession, removeSessionsBulk } from "~/actions/sessions";

type SortKey = "sessionDate" | "title" | "topSentiment" | "engagementScore" | "employee";
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

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface SessionTableProps {
  sessions: ParsedSession[];
  employees?: Employee[];
  isAdmin?: boolean;
}

function EmployeeCell({
  session,
  employees,
}: {
  session: ParsedSession;
  employees: Employee[];
}) {
  const [employeeId, setEmployeeId] = useState<string>(
    session.employeeId ?? "",
  );
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = value === "" ? null : value;
    setEmployeeId(value);
    startTransition(async () => {
      await assignSessionEmployee(session.id, next);
    });
  };

  return (
    <select
      value={employeeId}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="rounded border border-transparent bg-transparent py-0.5 text-sm text-gray-500 hover:border-gray-200 focus:border-gray-300 focus:outline-none disabled:opacity-50"
    >
      <option value="">—</option>
      {employees.map((emp) => (
        <option key={emp.id} value={emp.id}>
          {emp.name}
          {emp.department ? ` (${emp.department})` : ""}
        </option>
      ))}
    </select>
  );
}

function TitleCell({ session }: { session: ParsedSession }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === session.title) {
      setValue(session.title);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await renameSession(session.id, trimmed);
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(session.title);
            setEditing(false);
          }
        }}
        disabled={isPending}
        className="w-full rounded border border-gray-300 px-1.5 py-0.5 text-sm font-medium focus:border-gray-500 focus:outline-none disabled:opacity-50"
      />
    );
  }

  return (
    <div className="group flex items-center gap-1.5">
      <Link
        href={`/dashboard/${session.id}`}
        className="hover:text-gray-600 hover:underline"
      >
        {value}
      </Link>
      <button
        onClick={startEdit}
        className="invisible text-gray-400 hover:text-gray-700 group-hover:visible"
        aria-label="Rename session"
      >
        <FiEdit2 className="h-3 w-3" />
      </button>
    </div>
  );
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

export function SessionTable({ sessions, employees = [], isAdmin = false }: SessionTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("sessionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const showHandledBy =
    isAdmin || new Set(sessions.map((s) => s.handledBy.id)).size > 1;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkDeleting, startBulkTransition] = useTransition();

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const query = search.toLowerCase();
  const filtered = query
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          (s.employee?.name ?? "").toLowerCase().includes(query),
      )
    : sessions;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "sessionDate") {
      cmp = a.sessionDate.getTime() - b.sessionDate.getTime();
    } else if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (sortKey === "topSentiment") {
      cmp = a.topSentiment.localeCompare(b.topSentiment);
    } else if (sortKey === "engagementScore") {
      cmp = a.engagementScore - b.engagementScore;
    } else if (sortKey === "employee") {
      cmp = (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "");
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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? (
      <FiChevronUp className="inline h-3 w-3" />
    ) : (
      <FiChevronDown className="inline h-3 w-3" />
    );
  };

  const th =
    "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800";

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
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
              <th className="w-10 px-4 py-3">
                <IndeterminateCheckbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300"
                />
              </th>
              <th className={th} onClick={() => handleSort("sessionDate")}>
                Date <SortIcon col="sessionDate" />
              </th>
              {showHandledBy && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  Handled by
                </th>
              )}
              <th className={th} onClick={() => handleSort("title")}>
                Title <SortIcon col="title" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Type
              </th>
              <th className={th} onClick={() => handleSort("employee")}>
                Employee <SortIcon col="employee" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Emotion
              </th>
              <th className={th} onClick={() => handleSort("topSentiment")}>
                Sentiment <SortIcon col="topSentiment" />
              </th>
              <th className={th} onClick={() => handleSort("engagementScore")}>
                Engagement <SortIcon col="engagementScore" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={showHandledBy ? 9 : 8} className="px-4 py-8 text-center text-gray-400">
                  {search ? "No sessions match your search" : "No sessions yet"}
                </td>
              </tr>
            ) : (
              sorted.map((s) => (
                <tr
                  key={s.id}
                  className={`hover:bg-gray-50 ${selected.has(s.id) ? "bg-gray-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => toggleOne(s.id, e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.sessionDate.toLocaleDateString("en-GB")}
                  </td>
                  {showHandledBy && (
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                        {s.handledBy.name ?? "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium">
                    <TitleCell session={s} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {SESSION_TYPE_LABELS[
                      s.sessionType as keyof typeof SESSION_TYPE_LABELS
                    ] ?? s.sessionType}
                  </td>
                  <td className="px-4 py-3">
                    {employees.length > 0 ? (
                      <EmployeeCell session={s} employees={employees} />
                    ) : (
                      <span className="text-gray-500">
                        {s.employee?.name ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.status === "PROCESSING" ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <span className="capitalize">
                        {EMOTION_EMOJI[s.topEmotion] ?? ""} {s.topEmotion}
                      </span>
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
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-100">
                          <div
                            className="h-1.5 rounded-full bg-gray-800"
                            style={{ width: `${s.engagementScore}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {s.engagementScore}
                        </span>
                      </div>
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
