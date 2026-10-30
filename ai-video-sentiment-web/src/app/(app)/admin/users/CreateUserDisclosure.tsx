"use client";

import { useEffect, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { CreateUserForm } from "./CreateUserForm";

// Same modal mechanism as AddEmployeeDisclosure, with one deliberate
// difference: it does NOT close on success. CreateUserForm renders the new
// account's credentials after submit and the admin has to copy them, so the
// modal stays open until it is dismissed explicitly.
export function CreateUserDisclosure() {
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
        Create account
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create account"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative my-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-sm font-medium text-gray-800">
                Create account
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>
            <CreateUserForm />
          </div>
        </div>
      )}
    </>
  );
}
