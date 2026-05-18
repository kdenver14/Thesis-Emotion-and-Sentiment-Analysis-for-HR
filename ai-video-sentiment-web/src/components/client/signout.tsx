"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FiLogOut, FiX } from "react-icons/fi";

export function SignOutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const close = () => {
    if (signingOut) return;
    setOpen(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({
      redirect: false,
    });
    router.push("/login");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
      >
        <FiLogOut className="h-4 w-4" />
        Logout
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-900">Log out?</h2>
              <button
                onClick={close}
                disabled={signingOut}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              You will be signed out and returned to the login page.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={signingOut}
                className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2 rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
              >
                <FiLogOut className="h-4 w-4" />
                {signingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
