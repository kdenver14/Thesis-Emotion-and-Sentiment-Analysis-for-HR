"use client";

import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheck, FiPlus, FiX } from "react-icons/fi";
import { CreateUserForm, type CreatedNotice } from "./CreateUserForm";

// A success notice hides itself; a warning stays until dismissed.
const NOTICE_MS = 6000;

// Same modal mechanism as AddEmployeeDisclosure: it closes on success and an
// "Account created" notice pops up. No credentials are shown; the temporary
// password goes only to the new user's email.
export function CreateUserDisclosure() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<CreatedNotice | null>(null);

  useEffect(() => {
    if (!notice || notice.warning) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

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
            <CreateUserForm
              onCreated={(n) => {
                setOpen(false);
                setNotice(n);
              }}
            />
          </div>
        </div>
      )}
      {/* Always mounted: screen readers skip a live region inserted with
          its text already inside. */}
      <div role="status">
        {notice && (
          <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
            {notice.warning ? (
              <FiAlertTriangle
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500"
                aria-hidden
              />
            ) : (
              <FiCheck
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-700"
                aria-hidden
              />
            )}
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-gray-900">
                Account created
              </p>
              <p className="text-xs text-gray-600">{notice.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="flex-shrink-0 rounded-md p-0.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
