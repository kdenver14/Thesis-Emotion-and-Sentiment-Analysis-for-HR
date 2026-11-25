"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "~/actions/users";
import {
  DEMO_EMAIL_MESSAGE,
  completeDemoEmail,
  isOffDemoPattern,
} from "~/lib/demoEmail";
import { EMAIL_MAX, FULL_NAME_MAX } from "~/lib/inputLimits";

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
const selectClass =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

// Shown by the page once the modal closes. The temporary password is never
// shown here: it goes only to the new user's inbox.
export type CreatedNotice = { text: string; warning: boolean };

export function CreateUserForm({
  onCreated,
}: {
  onCreated: (notice: CreatedNotice) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"STAFF" | "DIRECTOR">("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailError = isOffDemoPattern(email) ? DEMO_EMAIL_MESSAGE : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await createUser({ name, email, role });

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onCreated(
      result.warning
        ? { text: result.warning, warning: true }
        : {
            text: `We emailed ${email.trim().toLowerCase()} a verification link and a temporary password. They choose their own password at first sign-in.`,
            warning: false,
          },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Name *</label>
          <input
            maxLength={FULL_NAME_MAX}
            type="text"
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Email *</label>
          <input
            maxLength={EMAIL_MAX}
            type="email"
            required
            placeholder="blastasia.hr.app+name@gmail.com"
            aria-invalid={emailError ? true : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              // First Tab completes the address; the next Tab moves on as usual.
              if (e.key !== "Tab" || e.shiftKey) return;
              const completed = completeDemoEmail(email, name);
              if (completed) {
                e.preventDefault();
                setEmail(completed);
              }
            }}
            className={inputClass}
          />
          {emailError && (
            <p role="alert" className="text-xs text-red-500">
              {emailError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "STAFF" | "DIRECTOR")}
            className={selectClass}
          >
            <option value="STAFF">HR Staff</option>
            <option value="DIRECTOR">HR Director</option>
          </select>
        </div>
        <p className="text-xs text-gray-500">
          A temporary password is emailed to them with the verification link.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim()}
          className="rounded-md bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}
