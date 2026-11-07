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

  // Name and "Change" are separate controls: a link nested in a button gave
  // one click two meanings and is not valid for assistive tech.
  return (
    <span className="inline-flex items-baseline gap-2">
      {assigned ? (
        <Link
          href={`/employees/${assigned.id}`}
          className="text-gray-900 underline-offset-2 hover:underline"
        >
          {assigned.name}
        </Link>
      ) : (
        <span className="text-gray-500">Unassigned</span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={isPending}
        className="text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
      >
        {assigned ? "Change" : "Assign"}
      </button>
    </span>
  );
}
