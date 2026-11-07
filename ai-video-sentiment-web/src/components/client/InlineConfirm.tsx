"use client";

import { useState } from "react";
import { FiTrash2 } from "react-icons/fi";

interface InlineConfirmProps {
  label: string;
  question: string;
  confirmLabel: string;
  keepLabel: string;
  busyLabel: string;
  onConfirm: () => Promise<void>;
  // A quiet trash icon instead of a labeled button, for page headers where
  // deleting is the rarest action. `label` becomes its accessible name.
  iconOnly?: boolean;
}

const destructiveButton =
  "rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50";
const neutralButton =
  "rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50";

// Two-step destructive button: the first click only asks, the second acts.
// Inline rather than a modal so the progress it interrupts stays visible.
export function InlineConfirm({
  label,
  question,
  confirmLabel,
  keepLabel,
  busyLabel,
  onConfirm,
  iconOnly = false,
}: InlineConfirmProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (busy) {
    return <span className="text-sm text-gray-500">{busyLabel}</span>;
  }
  if (!asking) {
    return iconOnly ? (
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={label}
        title={label}
        className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <FiTrash2 className="h-4 w-4" aria-hidden />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={destructiveButton}
      >
        {label}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={question}
      className="flex flex-wrap items-center justify-center gap-2"
    >
      <span className="text-sm text-gray-700">{question}</span>
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
        className={destructiveButton}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className={neutralButton}
      >
        {keepLabel}
      </button>
    </div>
  );
}
