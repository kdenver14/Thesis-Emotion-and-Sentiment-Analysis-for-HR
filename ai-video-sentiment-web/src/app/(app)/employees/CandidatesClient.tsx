"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FiChevronUp,
  FiChevronDown,
  FiX,
  FiPlus,
  FiSearch,
} from "react-icons/fi";
import { ScoreBadge } from "~/components/ui/ScoreBadge";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { AddEmployeeForm } from "./AddEmployeeForm";

export interface CandidateRow {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  sessionCount: number;
  avgScore: number | null;
  lastDateISO: string | null;
  status: "active" | "review" | "pending";
}

type SortKey = "name" | "department" | "sessionCount" | "avgScore";
type SortDir = "asc" | "desc";

function SortIcon({
  col,
  active,
  dir,
}: {
  col: SortKey;
  active: SortKey;
  dir: SortDir;
}) {
  if (col !== active) return null;
  return dir === "asc" ? (
    <FiChevronUp className="inline h-3 w-3" />
  ) : (
    <FiChevronDown className="inline h-3 w-3" />
  );
}

export function CandidatesClient({
  candidates,
}: {
  candidates: CandidateRow[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [slideOpen, setSlideOpen] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.department?.toLowerCase().includes(q) ?? false),
    );
  }, [candidates, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "department")
        cmp = (a.department ?? "").localeCompare(b.department ?? "");
      else if (sortKey === "sessionCount")
        cmp = a.sessionCount - b.sessionCount;
      else if (sortKey === "avgScore")
        cmp = (a.avgScore ?? -1) - (b.avgScore ?? -1);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const th =
    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 cursor-pointer select-none hover:text-gray-800 whitespace-nowrap";
  const thStatic =
    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 whitespace-nowrap";

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {candidates.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <FiSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search candidates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 pl-8 pr-3 text-sm focus:border-slate-400 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setSlideOpen(true)}
            className="btn-primary flex items-center gap-1.5"
          >
            <FiPlus className="h-4 w-4" />
            Add candidate
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className={th} onClick={() => handleSort("name")}>
                Name <SortIcon col="name" active={sortKey} dir={sortDir} />
              </th>
              <th className={th} onClick={() => handleSort("department")}>
                Department{" "}
                <SortIcon col="department" active={sortKey} dir={sortDir} />
              </th>
              <th className={th} onClick={() => handleSort("sessionCount")}>
                Sessions{" "}
                <SortIcon col="sessionCount" active={sortKey} dir={sortDir} />
              </th>
              <th className={th} onClick={() => handleSort("avgScore")}>
                Avg Score{" "}
                <SortIcon col="avgScore" active={sortKey} dir={sortDir} />
              </th>
              <th className={thStatic}>Status</th>
              <th className={thStatic}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  {search
                    ? "No candidates match your search."
                    : "No candidates yet — add one to get started."}
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.email && (
                          <p className="text-xs text-gray-400">{c.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.department ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.sessionCount}</td>
                  <td className="px-4 py-3">
                    {c.avgScore !== null ? (
                      <ScoreBadge score={c.avgScore} />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/employees/${c.id}`}
                      className="text-xs font-medium text-slate-600 hover:text-slate-800 hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over */}
      {slideOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setSlideOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Add candidate
              </h2>
              <button
                onClick={() => setSlideOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <AddEmployeeForm onSuccess={() => setSlideOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
