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
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    setLoading(true);
    const result = await updateCurrentUserName(trimmed);
    if (!result.error) {
      await update({ name: trimmed });
      setName(trimmed);
    }
    setLoading(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") cancel();
          }}
          disabled={loading}
          className="w-28 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
        />
        <button
          onClick={() => void save()}
          disabled={loading}
          className="text-gray-500 hover:text-gray-900"
        >
          <FiCheck className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          disabled={loading}
          className="text-gray-400 hover:text-gray-700"
        >
          <FiX className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to edit name"
      className="truncate text-xs text-gray-500 hover:text-gray-800 hover:underline"
    >
      {name || "—"}
    </button>
  );
}
