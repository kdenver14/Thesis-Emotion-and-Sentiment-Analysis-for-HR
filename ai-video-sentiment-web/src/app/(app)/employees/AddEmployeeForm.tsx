"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEmployee } from "~/actions/employees";

export function AddEmployeeForm() {
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
        className="rounded-md bg-gray-800 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-gray-700"
      >
        {loading ? "Adding..." : "Add employee"}
      </button>
    </form>
  );
}
