"use client";

import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { removeSession } from "~/actions/sessions";

interface DeleteSessionButtonProps {
  sessionId: string;
  // Quiet trash icon for the session header, where delete is the rarest
  // action. The failed-session view keeps the labeled button.
  iconOnly?: boolean;
}

export function DeleteSessionButton({ sessionId, iconOnly = false }: DeleteSessionButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    await removeSession(sessionId);
    router.push("/dashboard");
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Delete session"
        title="Delete session"
        className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <FiTrash2 className="h-4 w-4" aria-hidden />
      </button>
    );
  }

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
