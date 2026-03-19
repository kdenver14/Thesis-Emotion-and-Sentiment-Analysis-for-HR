"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FiCheck, FiUpload, FiFile, FiX } from "react-icons/fi";
import type { EmployeeRow } from "~/server/repositories/employee";
import type { SessionType } from "~/types/analysis";
import { SESSION_TYPES, SESSION_TYPE_LABELS } from "~/types/analysis";

type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Candidate Info" },
  { n: 2, label: "Upload Video" },
  { n: 3, label: "Review & Submit" },
];

interface InferenceProps {
  employees: EmployeeRow[];
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map(({ n, label }, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                  done
                    ? "border-slate-700 bg-slate-700 text-white"
                    : active
                      ? "border-slate-700 bg-white text-slate-700"
                      : "border-gray-200 bg-white text-gray-400"
                }`}
              >
                {done ? <FiCheck className="h-4 w-4" /> : n}
              </div>
              <span
                className={`whitespace-nowrap text-xs font-medium ${
                  active ? "text-slate-700" : done ? "text-slate-500" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 mb-5 h-0.5 w-16 sm:w-24 ${
                  n < current ? "bg-slate-700" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const inputCls =
  "rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none w-full";
const labelCls = "text-xs font-medium text-gray-500";

export function Inference({ employees }: InferenceProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1 fields
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("general");
  const [employeeId, setEmployeeId] = useState("");
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Step 2 fields
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedTitle = title.trim() || `Session ${new Date().toLocaleDateString("en-GB")}`;
  const selectedEmployee = employees.find((e) => e.id === employeeId) ?? null;

  const handleFileSelect = (f: File) => {
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", resolvedTitle);
      formData.append("sessionType", sessionType);
      if (employeeId) formData.append("employeeId", employeeId);
      if (sessionDate)
        formData.append("sessionDate", new Date(sessionDate).toISOString());

      const res = await fetch("/api/sentiment-inference", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Analysis failed");
      }

      const result = (await res.json()) as { sessionId: string };
      router.push(`/dashboard/${result.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Assessment</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a session recording for AI sentiment analysis.
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step 1 — Candidate Info */}
      {step === 1 && (
        <div className="card flex flex-col gap-5 p-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Candidate Info</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Provide details about the assessment session.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Session title</label>
              <input
                type="text"
                placeholder={`Session ${new Date().toLocaleDateString("en-GB")}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Session type</label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value as SessionType)}
                  className={inputCls}
                >
                  {SESSION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SESSION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Candidate (optional)</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={inputCls}
              >
                <option value="">— unassigned —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                    {emp.department ? ` · ${emp.department}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="btn-primary">
              Next: Upload Video →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Upload Video */}
      {step === 2 && (
        <div className="card flex flex-col gap-5 p-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Upload Video</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Select the recording to analyse. MP4, MOV, and AVI are supported.
            </p>
          </div>

          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <FiFile className="h-5 w-5 shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-400">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                aria-label="Remove file"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
                dragOver
                  ? "border-slate-400 bg-slate-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <FiUpload className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  Drop your video here, or{" "}
                  <span className="text-slate-700 underline">browse</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">MP4, MOV, AVI</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/mov,video/avi"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-outline">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!file}
              className="btn-primary disabled:opacity-40"
            >
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review & Submit */}
      {step === 3 && (
        <div className="card flex flex-col gap-5 p-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Review & Submit</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Confirm the details before starting analysis.
            </p>
          </div>

          <dl className="flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-200">
            {[
              { label: "Title", value: resolvedTitle },
              { label: "Session type", value: SESSION_TYPE_LABELS[sessionType] },
              {
                label: "Candidate",
                value: selectedEmployee
                  ? `${selectedEmployee.name}${selectedEmployee.department ? ` · ${selectedEmployee.department}` : ""}`
                  : "Unassigned",
              },
              {
                label: "Date",
                value: sessionDate
                  ? new Date(sessionDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—",
              },
              {
                label: "Video file",
                value: file?.name ?? "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-4 px-4 py-3">
                <dt className="w-28 shrink-0 text-xs font-medium text-gray-500">
                  {label}
                </dt>
                <dd className="min-w-0 truncate text-sm text-gray-800">{value}</dd>
              </div>
            ))}
          </dl>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              disabled={submitting}
              className="btn-outline disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary disabled:opacity-60"
            >
              {submitting ? "Analysing…" : "Start analysis"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
