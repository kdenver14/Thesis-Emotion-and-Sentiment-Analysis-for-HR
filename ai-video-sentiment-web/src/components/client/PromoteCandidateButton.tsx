"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { promoteCandidateToEmployee } from "~/actions/onboarding";

interface Props {
  sessionId: string;
  promotedEmployeeId: string | null;
}

export function PromoteCandidateButton({
  sessionId,
  promotedEmployeeId,
}: Props) {
  const [employeeId, setEmployeeId] = useState(promotedEmployeeId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (employeeId) {
    return (
      <p className="text-xs text-gray-500">
        Added as employee ·{" "}
        <Link
          href={`/employees/${employeeId}`}
          className="text-gray-700 hover:text-gray-900 hover:underline"
        >
          View employee
        </Link>
      </p>
    );
  }

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await promoteCandidateToEmployee(sessionId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.employeeId) setEmployeeId(res.employeeId);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add as employee"}
      </button>
      {error && <p className="text-xs text-gray-500">{error}</p>}
    </div>
  );
}
