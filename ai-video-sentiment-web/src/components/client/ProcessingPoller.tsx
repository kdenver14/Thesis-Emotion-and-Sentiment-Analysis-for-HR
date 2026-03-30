"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

interface ProcessingPollerProps {
  failed?: boolean;
  headless?: boolean;
  errorDetails?: string;
}

export function ProcessingPoller({ failed, headless, errorDetails }: ProcessingPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (failed) return;

    const interval = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router, failed]);

  if (headless) return null;

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 p-12">
        <p className="text-sm font-medium text-gray-800">Analysis failed</p>
        <p className="text-xs text-gray-500">
          Something went wrong during processing. Please try uploading again.
        </p>
        {errorDetails && (
          <p className="mt-1 max-w-md rounded-lg bg-gray-50 px-4 py-2 text-center font-mono text-xs text-gray-500">
            {errorDetails}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 p-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800" />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-800">
          Processing video...
        </p>
        <p className="mt-1 text-xs text-gray-500">
          This may take a few minutes. You can navigate away — results will
          appear when ready.
        </p>
      </div>
    </div>
  );
}
