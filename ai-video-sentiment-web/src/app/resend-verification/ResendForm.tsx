"use client";

import Link from "next/link";
import { useState } from "react";
import { resendVerification } from "~/actions/auth";
import { EMAIL_MAX } from "~/lib/inputLimits";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none";

const GENERIC =
  "If an unverified account exists for that email, a new verification link is on its way. Check your inbox.";

export function ResendForm({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Always generic: never reveal whether the account exists or its state.
    await resendVerification(email);
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
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
    );
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={onSubmit}>
      <div>
        <label className="text-sm font-medium text-gray-700">
          Email address
        </label>
        <input
          maxLength={EMAIL_MAX}
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
        {loading ? "Sending..." : "Resend verification link"}
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
