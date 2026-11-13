"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  FiArrowDown,
  FiArrowUp,
  FiChevronLeft,
  FiChevronRight,
  FiSearch,
} from "react-icons/fi";
import type { EmployeeRow } from "~/server/repositories/employee";

interface EmployeeListProps {
  employees: EmployeeRow[];
  // Archived employees, shown only when the "Archived" view is picked.
  archived: EmployeeRow[];
  // Page-level action (the add-employee button). It shares the toolbar row so
  // it does not cost a separate, mostly empty row above the list.
  actions?: ReactNode;
}

type SortColumn = "name" | "department" | "email" | "addedBy" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;

type View = "active" | "archived";
const VIEW_LABEL: Record<View, string> = {
  active: "Active",
  archived: "Archived",
};

// One column template for the header and every row, so they line up. Phones
// get no columns: each row stacks name over department and email.
const COLUMNS =
  "sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_6rem] sm:gap-4";

const HEADERS: { column: SortColumn; label: string }[] = [
  { column: "name", label: "Name" },
  { column: "department", label: "Department" },
  { column: "email", label: "Email" },
  { column: "addedBy", label: "Added by" },
  { column: "createdAt", label: "Added on" },
];

const SORT_VALUE: Record<SortColumn, (e: EmployeeRow) => string | number> = {
  name: (e) => e.name,
  department: (e) => e.department ?? "",
  email: (e) => e.email ?? "",
  addedBy: (e) => e.addedBy?.name ?? "",
  createdAt: (e) => e.createdAt.getTime(),
};

// Blanks sort last in either direction; ties fall back to name.
function compareBy(column: SortColumn, dir: SortDir) {
  return (a: EmployeeRow, b: EmployeeRow): number => {
    const x = SORT_VALUE[column](a);
    const y = SORT_VALUE[column](b);
    if (x === "" || y === "") {
      if (x !== y) return x === "" ? 1 : -1;
      return a.name.localeCompare(b.name);
    }
    const cmp =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return (dir === "asc" ? cmp : -cmp) || a.name.localeCompare(b.name);
  };
}

export function EmployeeList({
  employees: active,
  archived,
  actions,
}: EmployeeListProps) {
  const [view, setView] = useState<View>("active");
  const otherView: View = view === "active" ? "archived" : "active";
  const employees = view === "archived" ? archived : active;
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [addedBy, setAddedBy] = useState("");
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({
    column: "name",
    dir: "asc",
  });
  const [page, setPage] = useState(1);

  const departments = useMemo(
    () =>
      [
        ...new Set(employees.map((e) => e.department).filter(Boolean)),
      ].sort() as string[],
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
    return rows.sort(compareBy(sort.column, sort.dir));
  }, [employees, query, department, addedBy, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, department, addedBy, sort, view]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice(startIdx, endIdx);

  // Clicking the active column flips its direction; a new column starts
  // A to Z, or newest first for the date.
  const sortBy = (column: SortColumn) =>
    setSort((s) =>
      s.column === column
        ? { column, dir: s.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "createdAt" ? "desc" : "asc" },
    );

  if (active.length === 0 && archived.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actions && <div className="flex justify-end">{actions}</div>}
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No employees yet. Add one to get started.
        </div>
      </div>
    );
  }

  const selectClass =
    "min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none sm:w-44 sm:flex-none";

  return (
    <div className="flex flex-col gap-3">
      {/* Search and both filters always in view: no toggle, no second row. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search name, email, department"
            aria-label="Search employees"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-200 py-1.5 pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        {(archived.length > 0 ||
          departments.length > 0 ||
          adders.length > 0) && (
          <div className="flex gap-2">
            {archived.length > 0 && (
              // Two states only: one button that names the list shown and
              // flips to the other on click. Fixed width so the bar holds still.
              <button
                type="button"
                onClick={() => {
                  setView(otherView);
                  // The other list has its own departments and adders.
                  setDepartment("");
                  setAddedBy("");
                }}
                title={`Showing ${view} employees. Click to show ${otherView}.`}
                aria-label={`Showing ${view} employees. Click to show ${otherView}.`}
                className="w-24 shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 focus:border-gray-400 focus:outline-none"
              >
                {VIEW_LABEL[view]}
              </button>
            )}
            {departments.length > 0 && (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                aria-label="Filter by department"
                className={selectClass}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {adders.length > 0 && (
              <select
                value={addedBy}
                onChange={(e) => setAddedBy(e.target.value)}
                aria-label="Filter by who added the employee"
                className={selectClass}
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
        {actions}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          {employees.length === 0
            ? view === "archived"
              ? "No archived employees."
              : "No active employees. Add one to get started."
            : "No employees match your search."}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {/* Column headers double as the sort control. */}
            <div
              className={`hidden border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 ${COLUMNS}`}
            >
              {HEADERS.map(({ column, label }) => {
                const isSorted = sort.column === column;
                const Arrow = sort.dir === "asc" ? FiArrowUp : FiArrowDown;
                return (
                  <button
                    key={column}
                    type="button"
                    onClick={() => sortBy(column)}
                    className={`flex items-center gap-1 text-left hover:text-gray-900 ${isSorted ? "text-gray-900" : ""}`}
                  >
                    {label}
                    {isSorted && (
                      <>
                        <Arrow className="h-3 w-3" aria-hidden />
                        <span className="sr-only">
                          (sorted{" "}
                          {sort.dir === "asc" ? "ascending" : "descending"})
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <ul className="divide-y divide-gray-100">
              {pageRows.map((emp) => (
                <li key={emp.id}>
                  <Link
                    href={`/employees/${emp.id}`}
                    className={`block px-4 py-2.5 text-sm hover:bg-gray-50 ${COLUMNS}`}
                  >
                    <span className="block truncate font-medium text-gray-900">
                      {emp.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500 sm:hidden">
                      {[emp.department, emp.email].filter(Boolean).join(" · ")}
                    </span>
                    <span className="hidden truncate text-gray-600 sm:block">
                      {emp.department ?? "—"}
                    </span>
                    <span className="hidden truncate text-gray-600 sm:block">
                      {emp.email ?? "—"}
                    </span>
                    <span className="hidden truncate text-gray-600 sm:block">
                      {emp.addedBy?.name ?? "—"}
                    </span>
                    <span className="hidden tabular-nums text-gray-600 sm:block">
                      {emp.createdAt.toLocaleDateString("en-GB")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Paging only matters past one page; for one it is just noise. */}
          {totalPages > 1 && (
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                  aria-label="Next page"
                >
                  Next
                  <FiChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
