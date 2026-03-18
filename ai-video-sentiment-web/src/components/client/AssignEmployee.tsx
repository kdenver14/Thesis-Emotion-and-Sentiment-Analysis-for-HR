"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { assignSessionEmployee } from "~/actions/sessions";

interface Employee {
  id: string;
  name: string;
  department: string | null;
}

interface AssignEmployeeProps {
  sessionId: string;
  employees: Employee[];
  current: { id: string; name: string } | null;
}

export function AssignEmployee({
  sessionId,
  employees,
  current,
}: AssignEmployeeProps) {
  const [editing, setEditing] = useState(false);
  const [assigned, setAssigned] = useState(current);
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    const next = value === "" ? null : employees.find((e) => e.id === value) ?? null;
    setAssigned(next ? { id: next.id, name: next.name } : null);
    setEditing(false);
    startTransition(async () => {
      await assignSessionEmployee(sessionId, next?.id ?? null);
    });
  };

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={assigned?.id ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setEditing(false)}
        disabled={isPending}
        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
            {emp.department ? ` (${emp.department})` : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={isPending}
      className="rounded px-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
      title="Assign employee"
    >
      {assigned ? (
        <Link
          href={`/employees/${assigned.id}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
        >
          {assigned.name}
        </Link>
      ) : (
        <span className="italic">Assign employee…</span>
      )}
    </button>
  );
}
