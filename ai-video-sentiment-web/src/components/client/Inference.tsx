"use client";

import { useState } from "react";
import UploadVideo from "./UploadVideo";
import type { EmployeeRow } from "~/server/repositories/employee";
import type { SessionType } from "~/types/analysis";
import { SESSION_TYPES, SESSION_TYPE_LABELS } from "~/types/analysis";

interface InferenceProps {
  employees: EmployeeRow[];
}

export function Inference({ employees }: InferenceProps) {
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("general");
  const [employeeId, setEmployeeId] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const metadata = {
    title: title || `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType,
    employeeId: employeeId || undefined,
    sessionDate: sessionDate ? new Date(sessionDate).toISOString() : undefined,
    interviewerName: interviewerName || undefined,
  };

  return (
    <div className="flex h-fit w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-slate-700">Session details</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Title</label>
            <input
              type="text"
              placeholder="Session title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Type</label>
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as SessionType)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SESSION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Employee (optional)</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            >
              <option value="">— none —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                  {emp.department ? ` (${emp.department})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Interviewer</label>
            <input
              type="text"
              placeholder="Interviewer name"
              value={interviewerName}
              onChange={(e) => setInterviewerName(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <UploadVideo metadata={metadata} />
    </div>
  );
}
