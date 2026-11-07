"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchSessionStatus } from "~/actions/sessions";

interface ProcessingPollerProps {
  sessionId: string;
  // Status the page rendered with; any change (UPLOADING -> PROCESSING ->
  // COMPLETED/FAILED, or the session gone after a cancel) re-renders it.
  status: string;
}

const POLL_INTERVAL_MS = 3000;

export function ProcessingPoller({ sessionId, status }: ProcessingPollerProps) {
  const router = useRouter();

  useEffect(() => {
    const poll = async () => {
      const result = await fetchSessionStatus(sessionId);
      if (result?.status !== status) {
        clearInterval(interval);
        router.refresh();
      }
    };
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, status, router]);

  return null;
}
