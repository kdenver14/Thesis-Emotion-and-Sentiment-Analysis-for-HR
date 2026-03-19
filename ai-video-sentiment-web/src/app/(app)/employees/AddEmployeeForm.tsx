"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEmployee } from "~/actions/employees";

interface AddEmployeeFormProps {
  onSuccess?: () => void;
}

export function AddEmployeeForm({ onSuccess }: AddEmployeeFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    const result = await addEmployee({
      name,
      email: email || undefined,
      department: department || undefined,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setEmail("");
      setDepartment("");
      router.refresh();
      onSuccess?.();
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Name *</label>
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Email</label>
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Department</label>
        <input
          type="text"
          placeholder="e.g. Engineering"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="btn-primary w-full"
      >
        {loading ? "Adding..." : "Add candidate"}
      </button>
    </form>
  );
}
