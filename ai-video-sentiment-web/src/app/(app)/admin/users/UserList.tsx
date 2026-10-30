"use client";

import { useState, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FiChevronDown, FiChevronUp, FiCopy, FiCheck, FiTrash2, FiEdit2, FiX } from "react-icons/fi";
import { removeUser, updateUserName } from "~/actions/users";
import type { UserRow } from "~/actions/users";

const ROLE_LABEL: Record<string, string> = {
  MANAGER: "HR Manager",
  DIRECTOR: "HR Director",
  STAFF: "HR Staff",
};

const ROLE_ORDER = ["MANAGER", "DIRECTOR", "STAFF"] as const;
type RoleKey = (typeof ROLE_ORDER)[number];

const SECTION_LABEL: Record<RoleKey, string> = {
  MANAGER: "HR Managers",
  DIRECTOR: "HR Directors",
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
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const credentialText = `Name: ${user.name ?? ""}\nEmail: ${user.email ?? ""}\nRole: ${ROLE_LABEL[user.role] ?? user.role}`;

  const startNameEdit = () => {
    setNameDraft(user.name ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const cancelNameEdit = () => {
    setEditingName(false);
    setNameDraft(user.name ?? "");
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user.name) {
      cancelNameEdit();
      return;
    }
    setSavingName(true);
    const result = await updateUserName(user.id, trimmed);
    if (result.error) {
      alert(result.error);
      setSavingName(false);
      return;
    }
    setSavingName(false);
    setEditingName(false);
    router.refresh();
  };

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
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-400">Name</span>
                {editingName && !readOnly ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveName();
                        if (e.key === "Escape") cancelNameEdit();
                      }}
                      disabled={savingName}
                      className="w-40 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    />
                    <button
                      onClick={() => void saveName()}
                      disabled={savingName}
                      className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
                      aria-label="Save name"
                    >
                      <FiCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={cancelNameEdit}
                      disabled={savingName}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
                      aria-label="Cancel"
                    >
                      <FiX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span>{user.name ?? "—"}</span>
                    {!readOnly && (
                      <button
                        onClick={startNameEdit}
                        className="text-gray-400 hover:text-gray-700"
                        aria-label="Edit name"
                      >
                        <FiEdit2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
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

export function UserList({
  users,
  readOnly,
  actions,
}: {
  users: UserRow[];
  readOnly?: boolean;
  // Page-level action (the create-account button). It sits on the first role
  // section's header row so it does not cost a separate, mostly empty row.
  actions?: ReactNode;
}) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actions && <div className="flex justify-end">{actions}</div>}
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No users yet.
        </div>
      </div>
    );
  }

  const grouped: Record<RoleKey, UserRow[]> = {
    MANAGER: [],
    DIRECTOR: [],
    STAFF: [],
  };
  const other: UserRow[] = [];
  for (const u of users) {
    if (u.role === "MANAGER" || u.role === "DIRECTOR" || u.role === "STAFF") {
      grouped[u.role].push(u);
    } else {
      other.push(u);
    }
  }

  const firstRole = ROLE_ORDER.find((r) => grouped[r].length > 0);

  return (
    <div className="flex flex-col gap-6">
      {ROLE_ORDER.map((role) => {
        const list = grouped[role];
        if (list.length === 0) return null;
        return (
          <section key={role} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {SECTION_LABEL[role]}
              </h2>
              {role === firstRole && actions}
            </div>
            <div className="flex flex-col gap-2">
              {list.map((u) => (
                <UserRow key={u.id} user={u} readOnly={readOnly} />
              ))}
            </div>
          </section>
        );
      })}
      {other.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="px-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Other
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {other.map((u) => (
              <UserRow key={u.id} user={u} readOnly={readOnly} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
