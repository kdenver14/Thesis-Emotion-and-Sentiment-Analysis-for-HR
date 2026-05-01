"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronDown, FiChevronUp, FiCopy, FiCheck, FiTrash2 } from "react-icons/fi";
import { removeUser } from "~/actions/users";
import type { UserRow } from "~/actions/users";

const ROLE_LABEL: Record<string, string> = {
  MANAGER: "HR Manager",
  DIRECTOR: "HR Director",
  STAFF: "HR Staff",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-700"
    >
      {copied ? <FiCheck className="h-3 w-3" /> : <FiCopy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}


function UserRow({ user, readOnly }: { user: UserRow; readOnly?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const credentialText = `Name: ${user.name ?? ""}\nEmail: ${user.email ?? ""}\nRole: ${ROLE_LABEL[user.role] ?? user.role}`;

  const handleDelete = async () => {
    if (!confirm("Delete this user? Their sessions will be kept but unlinked.")) return;
    setDeleting(true);
    const result = await removeUser(user.id);
    if (result.error) {
      alert(result.error);
      setDeleting(false);
      return;
    }
    router.refresh();
  };

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{user.name ?? "—"}</span>
            <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>
          <div className="truncate text-xs text-gray-500">{user.email ?? "—"}</div>
        </div>
        {expanded ? (
          <FiChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
        ) : (
          <FiChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3">
          {/* Credentials block */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Account details</span>
              <CopyButton text={credentialText} />
            </div>
            <div className="flex flex-col gap-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-400">Name</span>
                <span>{user.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Email</span>
                <span className="font-mono">{user.email ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Role</span>
                <span>{ROLE_LABEL[user.role] ?? user.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Added</span>
                <span>{user.createdAt ? user.createdAt.toLocaleDateString("en-GB") : "—"}</span>
              </div>
            </div>
          </div>

          {user.role !== "MANAGER" && !readOnly && (
            <div className="border-t border-gray-100 pt-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                <FiTrash2 className="h-3 w-3" />
                {deleting ? "Deleting..." : "Delete account"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function UserList({ users, readOnly }: { users: UserRow[]; readOnly?: boolean }) {
  if (users.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
        No users yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <UserRow key={u.id} user={u} readOnly={readOnly} />
      ))}
    </div>
  );
}
