"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiSearch } from "react-icons/fi";
import type { EmployeeRow } from "~/server/repositories/employee";

interface EmployeeListProps {
  employees: EmployeeRow[];
  seesAllUsers: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function EmployeeList({ employees, seesAllUsers }: EmployeeListProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");

  const departments = useMemo(
    () =>
      [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[],
    [employees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (department && e.department !== department) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.email?.toLowerCase().includes(q) ?? false) ||
        (e.department?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [employees, query, department]);

  if (employees.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
        No employees yet. Add one to get started.
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search name, email, department"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none sm:w-48"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No employees match your search.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((emp) => (
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
                  {[
                    emp.department,
                    emp.email,
                    `Added ${emp.createdAt.toLocaleDateString("en-GB")}`,
                    seesAllUsers && emp.addedBy
                      ? `by ${emp.addedBy.name ?? "—"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
