"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeEmployee } from "~/actions/employees";
import { InlineConfirm } from "~/components/client/InlineConfirm";

interface DeleteEmployeeButtonProps {
  employeeId: string;
}

export function DeleteEmployeeButton({
  employeeId,
}: DeleteEmployeeButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    const result = await removeEmployee(employeeId);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/employees");
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <InlineConfirm
        label="Delete"
        question="Delete this employee? Their sessions will be kept but unlinked."
        confirmLabel="Yes, delete"
        keepLabel="Keep"
        busyLabel="Deleting..."
        onConfirm={handleDelete}
        iconOnly
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
