"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import type { ParsedSession } from "~/server/repositories/session";
import { SESSION_TYPE_LABELS } from "~/types/analysis";
import { assignSessionEmployee } from "~/actions/sessions";

type SortKey = "sessionDate" | "title" | "topSentiment" | "engagementScore";
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

export function SessionTable({ sessions, employees = [] }: SessionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("sessionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...sessions].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "sessionDate") {
      cmp = a.sessionDate.getTime() - b.sessionDate.getTime();
    } else if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title);
    } else if (sortKey === "topSentiment") {
      cmp = a.topSentiment.localeCompare(b.topSentiment);
    } else if (sortKey === "engagementScore") {
      cmp = a.engagementScore - b.engagementScore;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

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
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className={th} onClick={() => handleSort("sessionDate")}>
              Date <SortIcon col="sessionDate" />
            </th>
            <th className={th} onClick={() => handleSort("title")}>
              Title <SortIcon col="title" />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Employee
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
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                No sessions yet
              </td>
            </tr>
          ) : (
            sorted.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">
                  {s.sessionDate.toLocaleDateString("en-GB")}
                </td>
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/dashboard/${s.id}`}
                    className="hover:text-gray-600 hover:underline"
                  >
                    {s.title}
                  </Link>
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
                  <span className="capitalize">
                    {EMOTION_EMOJI[s.topEmotion] ?? ""} {s.topEmotion}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT_BADGE[s.topSentiment] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {s.topSentiment}
                  </span>
                </td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
