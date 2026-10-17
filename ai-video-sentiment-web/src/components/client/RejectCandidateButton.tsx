"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectCandidate } from "~/actions/onboarding";
import {
  REJECTED_CANDIDATE_RETENTION_MONTHS,
  candidateDeletionDate,
} from "~/lib/retention";

interface Props {
  sessionId: string;
}

export function RejectCandidateButton({ sessionId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleReject = () => {
    setError(null);
    startTransition(async () => {
      const res = await rejectCandidate(sessionId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
      >
        Mark as rejected
      </button>
    );
  }

  const deletionLabel = candidateDeletionDate(new Date()).toLocaleDateString(
    "en-GB",
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-600">
        This interview analysis will be permanently deleted on {deletionLabel},{" "}
        {REJECTED_CANDIDATE_RETENTION_MONTHS} months after rejection.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={isPending}
          className="w-fit rounded-md border border-gray-800 bg-gray-800 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
        >
          {isPending ? "Marking…" : "Confirm rejection"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="w-fit rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-gray-500">{error}</p>}
    </div>
  );
}
