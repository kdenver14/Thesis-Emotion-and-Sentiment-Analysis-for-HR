"use client";

import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "~/actions/auth";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none";

const GENERIC =
  "If an account exists for that email, a password reset link is on its way. The link expires in 15 minutes.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Always generic: no account enumeration.
    await requestPasswordReset(email);
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Forgot password
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Enter your email and we will send a reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-6 text-center">
              <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                {GENERIC}
              </p>
              <Link
                href="/login"
                className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={onSubmit}>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex w-full justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send reset link"}
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
          )}
        </div>
      </main>
    </div>
  );
}
