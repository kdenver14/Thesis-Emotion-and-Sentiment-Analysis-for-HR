"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSession } from "~/actions/upload";
import { InlineConfirm } from "~/components/client/InlineConfirm";
import { abortUpload } from "~/components/client/uploadRegistry";

export function CancelAnalysisButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    abortUpload(sessionId); // no-op unless this tab is still sending the video
    const result = await cancelSession(sessionId);
    if ("error" in result) {
      setError(result.error);
      router.refresh(); // it may have just finished: show the result instead
      return;
    }
    router.push("/upload");
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <InlineConfirm
        label="Cancel analysis"
        question="Cancel this analysis? The video and session will be deleted."
        confirmLabel="Yes, cancel"
        keepLabel="Keep analyzing"
        busyLabel="Cancelling..."
        onConfirm={handleCancel}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
