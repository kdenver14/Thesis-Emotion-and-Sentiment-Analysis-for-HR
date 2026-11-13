"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiArchive, FiRotateCcw } from "react-icons/fi";
import { archiveEmployee, restoreEmployee } from "~/actions/employees";
import { InlineConfirm } from "~/components/client/InlineConfirm";

// Archive asks first; Restore does not, since it only undoes an archive.
export function ArchiveEmployeeButton({
  employeeId,
  archived,
}: {
  employeeId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: (id: string) => Promise<{ error?: string }>) => {
    setError(null);
    try {
      const result = await action(employeeId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {archived ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void run(restoreEmployee).finally(() => setBusy(false));
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <FiRotateCcw className="h-3.5 w-3.5" aria-hidden />
          {busy ? "Restoring..." : "Restore"}
        </button>
      ) : (
        <InlineConfirm
          label="Archive"
          question="Archive this employee? Their sessions stay, and you can restore them later."
          confirmLabel="Yes, archive"
          keepLabel="Keep"
          busyLabel="Archiving..."
          onConfirm={() => run(archiveEmployee)}
          iconOnly
          icon={FiArchive}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
