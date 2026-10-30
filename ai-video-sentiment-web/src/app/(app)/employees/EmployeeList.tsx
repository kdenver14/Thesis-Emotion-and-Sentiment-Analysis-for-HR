"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  FiSearch,
  FiSliders,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import type { EmployeeRow } from "~/server/repositories/employee";

interface EmployeeListProps {
  employees: EmployeeRow[];
  seesAllUsers: boolean;
  // Page-level action (the add-employee button). It shares the filter row so
  // it does not cost a separate, mostly empty row above the list.
  actions?: ReactNode;
}

type SortKey = "name_asc" | "date_desc" | "date_asc";

const PAGE_SIZE = 10;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function EmployeeList({
  employees,
  seesAllUsers,
  actions,
}: EmployeeListProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [addedBy, setAddedBy] = useState("");
  const [sort, setSort] = useState<SortKey>("name_asc");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const departments = useMemo(
    () =>
      [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[],
    [employees],
  );

  const adders = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) {
      if (e.addedBy) map.set(e.addedBy.id, e.addedBy.name ?? "—");
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = employees.filter((e) => {
      if (department && e.department !== department) return false;
      if (addedBy && e.addedBy?.id !== addedBy) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.email?.toLowerCase().includes(q) ?? false) ||
        (e.department?.toLowerCase().includes(q) ?? false)
      );
    });
    const sorted = [...rows];
    if (sort === "name_asc") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "date_desc") {
      sorted.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    } else {
      sorted.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }
    return sorted;
  }, [employees, query, department, addedBy, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, department, addedBy, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice(startIdx, endIdx);

  if (employees.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actions && <div className="flex justify-end">{actions}</div>}
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No employees yet. Add one to get started.
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
  const selectClass =
    "rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

  const showAddedBy = seesAllUsers && adders.length > 0;
  const hasFilters = departments.length > 0 || showAddedBy;
  const activeFilterCount = (department ? 1 : 0) + (addedBy ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search name, email, department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <FiSliders className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-gray-900 px-1.5 text-xs text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={`${selectClass} sm:w-44`}
          >
            <option value="name_asc">Name (A–Z)</option>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
          </select>
          {actions}
        </div>
        {showFilters && hasFilters && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {departments.length > 0 && (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={`${selectClass} sm:w-44`}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {showAddedBy && (
              <select
                value={addedBy}
                onChange={(e) => setAddedBy(e.target.value)}
                className={`${selectClass} sm:w-44`}
              >
                <option value="">Added by anyone</option>
                {adders.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No employees match your search.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {pageRows.map((emp) => (
              <Link
                key={emp.id}
                href={`/employees/${emp.id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                  <span className="text-xs font-medium text-gray-600">
                    {getInitials(emp.name)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{emp.name}</span>
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {[emp.department, emp.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
            <span>
              Showing {startIdx + 1}–{endIdx} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                aria-label="Previous page"
              >
                <FiChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="tabular-nums text-gray-600">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                aria-label="Next page"
              >
                Next
                <FiChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
