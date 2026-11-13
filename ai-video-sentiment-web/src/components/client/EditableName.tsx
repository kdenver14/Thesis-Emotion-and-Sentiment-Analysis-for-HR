"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { FiCheck, FiX } from "react-icons/fi";
import { updateCurrentUserName } from "~/actions/users";

export function EditableName({ initialName }: { initialName: string }) {
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(name);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
    setError(null);
  };

  const save = async () => {
    if (loading) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    setLoading(true);
    setError(null);
    const result = await updateCurrentUserName(trimmed);
    setLoading(false);
    if (result.error) {
      // Stay in the field so the name can be corrected.
      setError(result.error);
      return;
    }
    await update({ name: trimmed });
    setName(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="relative flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          aria-label="Your name"
          aria-invalid={error ? true : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") cancel();
          }}
          readOnly={loading}
          className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
        />
        <button
          onClick={() => void save()}
          disabled={loading}
          aria-label="Save name"
          className="text-gray-500 hover:text-gray-900"
        >
          <FiCheck className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={loading}
          aria-label="Cancel"
          className="text-gray-400 hover:text-gray-700"
        >
          <FiX className="h-3.5 w-3.5" />
        </button>
        {/* Floats under the field: the top bar has no room for a line. */}
        {error && (
          <p
            role="alert"
            className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-gray-200 bg-white p-2 text-xs text-red-500 shadow-md"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to edit name"
      className="truncate text-xs font-medium text-gray-700 hover:text-gray-900 hover:underline"
    >
      {name || "—"}
    </button>
  );
}
