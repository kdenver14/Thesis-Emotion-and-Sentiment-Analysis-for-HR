"use client";

import { useEffect, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { AddEmployeeForm } from "./AddEmployeeForm";

// The add form is secondary to the list, so it opens in a centered modal on
// demand instead of taking permanent space. Closes on backdrop click, Esc,
// the X, or a successful add.
export function AddEmployeeDisclosure() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FiPlus className="h-4 w-4" />
        Add current employee
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add current employee"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium text-gray-800">
                  Add current employee
                </h2>
                <p className="text-xs text-gray-400">
                  For staff already working at BlastAsia. New hires are added by
                  promoting their interview candidate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            <AddEmployeeForm onSuccess={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
