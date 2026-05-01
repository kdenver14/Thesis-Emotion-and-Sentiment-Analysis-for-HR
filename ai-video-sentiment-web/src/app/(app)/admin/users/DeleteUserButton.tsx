"use client";

import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { removeUser } from "~/actions/users";

export function DeleteUserButton({ userId }: { userId: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Delete this user? Their sessions will be kept but unlinked.")) return;
    const result = await removeUser(userId);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      className="rounded-md border border-gray-200 p-1.5 text-gray-400 hover:border-red-200 hover:text-red-500"
      title="Delete user"
    >
      <FiTrash2 className="h-3.5 w-3.5" />
    </button>
  );
}
