"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetPasswordWithToken } from "~/actions/auth";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const result = await resetPasswordWithToken(token, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          Password updated. Redirecting to sign in...
        </p>
        <Link
          href="/login"
          className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={onSubmit}>
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-500">
          {error}
        </div>
      )}
      <div>
        <label className="text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700">
          Confirm new password
        </label>
        <input
          type="password"
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
        {loading ? "Updating..." : "Update password"}
      </button>
      <p className="text-center text-sm">
        <Link
          href="/login"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
