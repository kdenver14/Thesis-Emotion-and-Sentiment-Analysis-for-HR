"use client";

import { useState, useRef, useTransition } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useRouter } from "next/navigation";

interface InlineTitleProps {
  initialValue: string;
  save: (value: string) => Promise<unknown>;
  className?: string;
}

export function InlineTitle({ initialValue, save, className }: InlineTitleProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const startEdit = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue) {
      setValue(initialValue);
      setEditing(false);
      return;
    }
    startTransition(async () => {
      await save(trimmed);
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(initialValue);
            setEditing(false);
          }
        }}
        disabled={isPending}
        className={`rounded border border-gray-300 bg-transparent px-1.5 py-0.5 focus:border-gray-500 focus:outline-none disabled:opacity-50 ${className ?? ""}`}
      />
    );
  }

  return (
    <div className="group flex items-center gap-2">
      <span className={className}>{value}</span>
      <button
        onClick={startEdit}
        className="invisible text-gray-400 hover:text-gray-700 group-hover:visible"
        aria-label="Rename"
      >
        <FiEdit2 className="h-4 w-4" />
      </button>
    </div>
  );
}
