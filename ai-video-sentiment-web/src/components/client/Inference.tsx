"use client";

import { useState } from "react";
import UploadVideo from "./UploadVideo";
import type { EmployeeRow } from "~/server/repositories/employee";
import type { SessionType } from "~/types/analysis";
import { SESSION_TYPES, SESSION_TYPE_LABELS } from "~/types/analysis";
import {
  PHONE_DIGITS,
  formatPhone,
  normalizePhone,
  toStoredPhone,
} from "~/lib/phone";

const MIN_MEETING_PARTICIPANTS = 2;
const MAX_MEETING_PARTICIPANTS = 20;

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

  // Meeting participants (declared at upload; bound to speakers later)
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    Array<string>(MIN_MEETING_PARTICIPANTS).fill(""),
  );

  function handleParticipantCount(n: number) {
    const clamped = Math.max(
      MIN_MEETING_PARTICIPANTS,
      Math.min(MAX_MEETING_PARTICIPANTS, Number.isNaN(n) ? MIN_MEETING_PARTICIPANTS : n),
    );
    setParticipantIds((prev) => {
      const next = prev.slice(0, clamped);
      while (next.length < clamped) next.push("");
      return next;
    });
  }

  function handleParticipantChange(idx: number, value: string) {
    setParticipantIds((prev) =>
      prev.map((v, i) => (i === idx ? value : v)),
    );
  }

  // Onboarding candidate fields
  const [candidateFirstName, setCandidateFirstName] = useState("");
  const [candidateLastName, setCandidateLastName] = useState("");
  const [candidatePosition, setCandidatePosition] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");

  // Validation touch state
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const isInterview = sessionType === "interview";
  const isMeeting = sessionType === "meeting";

  const meetingParticipantIds = [
    ...new Set(participantIds.filter((id) => id !== "")),
  ];
  const isMeetingValid =
    !isMeeting || meetingParticipantIds.length >= MIN_MEETING_PARTICIPANTS;
  const hasDuplicateParticipants =
    isMeeting &&
    meetingParticipantIds.length !==
      participantIds.filter((id) => id !== "").length;

  const candidateName =
    `${candidateFirstName.trim()} ${candidateLastName.trim()}`.trim();
  const hasFullName =
    candidateFirstName.trim() !== "" && candidateLastName.trim() !== "";

  const nameError =
    nameTouched && !hasFullName ? "First and last name are required" : null;
  const emailError = emailTouched && candidateEmail && !isValidEmail(candidateEmail) ? "Invalid email format" : null;
  const phoneError =
    candidatePhone && candidatePhone.length !== PHONE_DIGITS
      ? `Phone number must be exactly ${PHONE_DIGITS} digits`
      : null;
  const isInterviewValid = !isInterview || (
    hasFullName &&
    (!candidateEmail || isValidEmail(candidateEmail)) &&
    !phoneError
  );

  const metadata = {
    title: title || `Session ${new Date().toLocaleDateString("en-GB")}`,
    sessionType,
    employeeId:
      !isInterview && !isMeeting && employeeId ? employeeId : undefined,
    participantEmployeeIds: isMeeting ? meetingParticipantIds : undefined,
    sessionDate: sessionDate ? new Date(sessionDate).toISOString() : undefined,
    interviewerName: interviewerName || undefined,
    onboardingCandidate:
      isInterview && hasFullName
        ? {
            name: candidateName,
            position: candidatePosition || undefined,
            email: candidateEmail || undefined,
            phone: toStoredPhone(candidatePhone),
          }
        : undefined,
  };

  return (
    <div className="flex h-fit w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-slate-700">Session details</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
          {!isInterview && !isMeeting && (
            <div className="flex flex-col gap-1 sm:col-span-2">
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
          {isMeeting && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">
                  Number of participants
                </label>
                <input
                  type="number"
                  min={MIN_MEETING_PARTICIPANTS}
                  max={MAX_MEETING_PARTICIPANTS}
                  value={participantIds.length}
                  onChange={(e) =>
                    handleParticipantCount(Number(e.target.value))
                  }
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(() => {
                  const pickedSet = new Set(
                    participantIds.filter((v) => v !== ""),
                  );
                  return participantIds.map((id, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">
                        Participant {i + 1}
                      </label>
                      <select
                        value={id}
                        onChange={(e) =>
                          handleParticipantChange(i, e.target.value)
                        }
                        className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
                      >
                        <option value="">— select employee —</option>
                        {employees.map((emp) => {
                          const taken =
                            pickedSet.has(emp.id) && emp.id !== id;
                          return (
                            <option
                              key={emp.id}
                              value={emp.id}
                              disabled={taken}
                            >
                              {emp.name}
                              {emp.department ? ` (${emp.department})` : ""}
                              {taken ? " — already selected" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ));
                })()}
              </div>
              {hasDuplicateParticipants && (
                <p className="text-xs text-gray-400">
                  Each participant must be a different employee.
                </p>
              )}
              {!isMeetingValid && !hasDuplicateParticipants && (
                <p className="text-xs text-gray-400">
                  Select at least {MIN_MEETING_PARTICIPANTS} employees.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {isInterview && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-slate-700">
            Candidate details
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                First name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="First name"
                value={candidateFirstName}
                onChange={(e) => setCandidateFirstName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                className={`rounded-md border px-3 py-1.5 text-sm focus:outline-none ${nameError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-gray-400"}`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">
                Last name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Last name"
                value={candidateLastName}
                onChange={(e) => setCandidateLastName(e.target.value)}
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
              <label className="text-xs text-gray-500">Phone</label>
              <div
                className={`flex items-center rounded-md border ${phoneError ? "border-red-300 focus-within:border-red-400" : "border-gray-200 focus-within:border-gray-400"}`}
              >
                <span className="pl-3 text-sm text-gray-500">+63</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="9XX XXX XXXX"
                  value={formatPhone(candidatePhone)}
                  onChange={(e) =>
                    setCandidatePhone(normalizePhone(e.target.value))
                  }
                  className="w-full bg-transparent px-2 py-1.5 text-sm focus:outline-none"
                />
              </div>
              {phoneError && (
                <p className="text-xs text-red-500">{phoneError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
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
          </div>
        </div>
      )}

      <UploadVideo
        metadata={metadata}
        disabled={!isInterviewValid || !isMeetingValid}
      />
    </div>
  );
}
