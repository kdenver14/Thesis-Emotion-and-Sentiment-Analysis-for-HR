"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiCopy, FiCheck } from "react-icons/fi";
import { createUser } from "~/actions/users";
import { completeDemoEmail } from "~/lib/demoEmail";

const inputClass =
  "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
const selectClass =
  "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

type CreatedCredentials = { name: string; email: string; password: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  STAFF: "HR Staff",
  DIRECTOR: "HR Director",
};

function CredentialsCard({
  created,
  onDismiss,
}: {
  created: CreatedCredentials;
  onDismiss: () => void;
}) {
  const credentialText =
    `Name: ${created.name}\nEmail: ${created.email}\nPassword: ${created.password}\nRole: ${ROLE_LABEL[created.role] ?? created.role}`;
  const { copied, copy } = useCopyText(credentialText);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">Account created</span>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">
          Dismiss
        </button>
      </div>
      <div className="flex flex-col gap-1 text-xs text-gray-600">
        <div className="flex justify-between">
          <span className="text-gray-400">Name</span>
          <span>{created.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span>{ROLE_LABEL[created.role] ?? created.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Email</span>
          <span className="font-mono">{created.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Password</span>
          <span className="font-mono">{created.password}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Share these credentials with the user.</p>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-700"
        >
          {copied ? <FiCheck className="h-3 w-3" /> : <FiCopy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

export function CreateUserForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"STAFF" | "DIRECTOR">("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await createUser({ name, email, password, role });

    if (result.error) {
      setError(result.error);
    } else {
      setCreated({ name, email, password, role });
      setWarning(result.warning ?? null);
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {created && (
        <CredentialsCard
          created={created}
          onDismiss={() => {
            setCreated(null);
            setWarning(null);
          }}
        />
      )}
      {warning && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
          {warning}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Name *</label>
          <input
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
            type="email"
            required
            placeholder="blastasia.hr.app+name@gmail.com"
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
          <p className="text-xs text-gray-400">
            Must be blastasia.hr.app+&lt;name&gt;@gmail.com (demo mailbox). Press
            Tab to fill it in from the name.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Password *</label>
          <input
            type="password"
            required
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
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
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim() || !password}
          className="rounded-md bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>
    </div>
  );
}
