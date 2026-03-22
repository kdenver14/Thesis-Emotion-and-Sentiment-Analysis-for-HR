"use client";

import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { removeSession } from "~/actions/sessions";

interface DeleteSessionButtonProps {
  sessionId: string;
}

export function DeleteSessionButton({ sessionId }: DeleteSessionButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await removeSession(sessionId);
    router.push("/dashboard");
  };

  return (
    <button
      onClick={handleDelete}
      className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
    >
      <FiTrash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  );
}
