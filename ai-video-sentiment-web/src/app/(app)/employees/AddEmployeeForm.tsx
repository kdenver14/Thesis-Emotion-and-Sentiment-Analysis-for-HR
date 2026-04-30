"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEmployee } from "~/actions/employees";

const DEPARTMENTS = [
  "Architecture",
  "Engineering",
  "Environment",
  "Finance",
  "HR",
  "Management",
  "Operations",
  "Planning",
  "Technology",
  "Other",
] as const;

const STATUSES = ["Active", "Inactive", "On Leave"] as const;

export function AddEmployeeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("Active");
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
      role: role || undefined,
      phone: phone || undefined,
      status,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setEmail("");
      setDepartment("");
      setRole("");
      setPhone("");
      setStatus("Active");
      router.refresh();
    }
    setLoading(false);
  };

  const selectClass =
    "rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
  const inputClass =
    "rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

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
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Job Title</label>
        <input
          type="text"
          placeholder="e.g. Senior Engineer"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Department</label>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={selectClass}
        >
          <option value="">— Select department —</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Email</label>
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Phone</label>
        <input
          type="tel"
          placeholder="+1 555 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
