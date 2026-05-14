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

export function AddEmployeeForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("+63 ");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email format");
      return;
    }
    setLoading(true);
    setError(null);

    const phoneValue = phone.trim();
    const result = await addEmployee({
      name,
      email: email || undefined,
      department: department || undefined,
      phone: phoneValue && phoneValue !== "+63" ? phoneValue : undefined,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setEmail("");
      setDepartment("");
      setPhone("+63 ");
      router.refresh();
    }
    setLoading(false);
  };

  const selectClass =
    "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
  const inputClass =
    "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

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
        <label className="text-xs text-gray-500">Department</label>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={selectClass}
        >
          <option value="">— Select —</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Email</label>
          <input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Phone</label>
          <input
            type="tel"
            placeholder="+63 9XX XXX XXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
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
