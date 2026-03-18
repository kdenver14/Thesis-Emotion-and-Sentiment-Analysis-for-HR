"use client";

import { useRouter } from "next/navigation";
import { FiTrash2 } from "react-icons/fi";
import { removeEmployee } from "~/actions/employees";

interface DeleteEmployeeButtonProps {
  employeeId: string;
}

export function DeleteEmployeeButton({ employeeId }: DeleteEmployeeButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Delete this employee? Their sessions will be kept but unlinked.")) return;
    await removeEmployee(employeeId);
    router.push("/employees");
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
