"use client";

import { useState } from "react";
import UploadVideo from "./UploadVideo";
import type { EmployeeRow } from "~/server/repositories/employee";
import type { SessionType } from "~/types/analysis";
import { SESSION_TYPES, SESSION_TYPE_LABELS } from "~/types/analysis";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface InferenceProps {
  employees: EmployeeRow[];
  interviewerName: string;
}

export function Inference({ employees, interviewerName }: InferenceProps) {
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("interview");
  const [employeeId, setEmployeeId] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Onboarding candidate fields
  const [candidateName, setCandidateName] = useState("");
  const [candidatePosition, setCandidatePosition] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("+63 ");

  // Validation touch state
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const isOnboarding = sessionType === "onboarding";

  const nameError = nameTouched && !candidateName.trim() ? "Name is required" : null;
  const emailError = emailTouched && candidateEmail && !isValidEmail(candidateEmail) ? "Invalid email format" : null;
  const isOnboardingValid = !isOnboarding || (
    candidateName.trim() !== "" &&
    (!candidateEmail || isValidEmail(candidateEmail))
  );

  const metadata = {
    title: title || `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType,
    employeeId: !isOnboarding && employeeId ? employeeId : undefined,
    sessionDate: sessionDate ? new Date(sessionDate).toISOString() : undefined,
    interviewerName: interviewerName || undefined,
    onboardingCandidate:
      isOnboarding && candidateName
        ? {
            name: candidateName,
            position: candidatePosition || undefined,
            email: candidateEmail || undefined,
            phone: (() => { const p = candidatePhone.trim(); return p && p !== "+63" ? p : undefined; })(),
          }
        : undefined,
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
              onChange={(e) => {
                setSessionType(e.target.value as SessionType);
                setNameTouched(false);
                setEmailTouched(false);
              }}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            >
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SESSION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {!isOnboarding && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Employee (optional)
              </label>
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
          )}
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

      {isOnboarding && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-slate-700">
            Candidate details
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Full name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Candidate name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                className={`rounded-md border px-3 py-1.5 text-sm focus:outline-none ${nameError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-gray-400"}`}
              />
              {nameError && <p className="text-xs text-red-500">{nameError}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Position applied for
              </label>
              <input
                type="text"
                placeholder="e.g. Software Engineer"
                value={candidatePosition}
                onChange={(e) => setCandidatePosition(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Email</label>
              <input
                type="text"
                placeholder="candidate@email.com"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                className={`rounded-md border px-3 py-1.5 text-sm focus:outline-none ${emailError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-gray-400"}`}
              />
              {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Phone</label>
              <input
                type="tel"
                placeholder="+63 9XX XXX XXXX"
                value={candidatePhone}
                onChange={(e) => setCandidatePhone(e.target.value)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      <UploadVideo metadata={metadata} disabled={!isOnboardingValid} />
    </div>
  );
}
