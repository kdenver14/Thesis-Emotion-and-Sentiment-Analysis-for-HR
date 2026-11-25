"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { setOwnPassword } from "~/actions/users";
import { PASSWORD_MAX } from "~/schemas/auth";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const result = await setOwnPassword(password);
      if (result.error) {
        setError(result.error);
        return;
      }
      // Full page load: the router cache still holds /dashboard's earlier
      // redirect to this page.
      window.location.replace("/dashboard");
    } catch {
      setError("Could not save your password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={onSubmit}>
      {error && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-500"
        >
          {error}
        </div>
      )}
      <div>
        <label
          htmlFor="new-password"
          className="text-sm font-medium text-gray-700"
        >
          New password
        </label>
        <input
          maxLength={PASSWORD_MAX}
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </div>
      <div>
        <label
          htmlFor="confirm-password"
          className="text-sm font-medium text-gray-700"
        >
          Confirm new password
        </label>
        <input
          maxLength={PASSWORD_MAX}
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter password"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !password || !confirm}
        className="flex w-full justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Set password"}
      </button>
      <p className="text-center text-sm">
        <button
          type="button"
          onClick={() => {
            // Same as the app's Logout: no server redirect, then a full load.
            void signOut({ redirect: false }).then(() =>
              window.location.assign("/login"),
            );
          }}
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          Sign out
        </button>
      </p>
    </form>
  );
}
