"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchSessionStatus } from "~/actions/sessions";

interface ProcessingPollerProps {
  sessionId: string;
}

const POLL_INTERVAL_MS = 3000;

export function ProcessingPoller({ sessionId }: ProcessingPollerProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await fetchSessionStatus(sessionId);
      if (result?.status === "COMPLETED" || result?.status === "FAILED") {
        clearInterval(interval);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, router]);

  return null;
}
