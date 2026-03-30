"use client";

import Link from "next/link";
import { FiCheck, FiLoader, FiX } from "react-icons/fi";
import { useJobs } from "~/context/JobsContext";

export function JobStatusBar() {
  const { jobs, clearDone } = useJobs();
  if (jobs.length === 0) return null;

  const hasDone = jobs.some((j) => j.status !== "processing");

  return (
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1">
        {jobs.map((job) => (
          <div
            key={job.sessionId}
            className="flex items-center gap-1.5 text-xs text-gray-600"
          >
            {job.status === "processing" && (
              <FiLoader className="h-3 w-3 animate-spin text-gray-400" />
            )}
            {job.status === "completed" && (
              <FiCheck className="h-3 w-3 text-green-500" />
            )}
            {job.status === "failed" && (
              <FiX className="h-3 w-3 text-red-400" />
            )}
            <span className="max-w-[10rem] truncate font-medium">
              {job.title}
            </span>
            {job.status === "processing" && (
              <span className="text-gray-400">— analysing…</span>
            )}
            {job.status === "completed" && (
              <Link
                href={`/dashboard/${job.sessionId}`}
                className="text-gray-700 underline underline-offset-2 hover:text-gray-900"
              >
                View results
              </Link>
            )}
            {job.status === "failed" && (
              <span className="text-red-400">
                {job.errorMessage ?? "Failed"}
              </span>
            )}
          </div>
        ))}
        {hasDone && (
          <button
            onClick={clearDone}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
