"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { undoCandidateRejection } from "~/actions/onboarding";

interface Props {
  sessionId: string;
  rejectedDateLabel: string;
  deletionDateLabel: string;
}

export function UndoRejectionButton({
  sessionId,
  rejectedDateLabel,
  deletionDateLabel,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUndo = () => {
    setError(null);
    startTransition(async () => {
      const res = await undoCandidateRejection(sessionId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-600">
        Rejected on {rejectedDateLabel}. This session will be deleted on{" "}
        {deletionDateLabel}.
      </p>
      <button
        type="button"
        onClick={handleUndo}
        disabled={isPending}
        className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? "Undoing…" : "Undo rejection"}
      </button>
      {error && <p className="text-xs text-gray-500">{error}</p>}
    </div>
  );
}
