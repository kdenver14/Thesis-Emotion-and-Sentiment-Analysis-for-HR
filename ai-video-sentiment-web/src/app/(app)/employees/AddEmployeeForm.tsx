"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addEmployee } from "~/actions/employees";
import {
  PHONE_DIGITS,
  formatPhone,
  normalizePhone,
  toStoredPhone,
} from "~/lib/phone";
import { EMAIL_MAX, NAME_PART_MAX } from "~/lib/inputLimits";

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

export function AddEmployeeForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Invalid email format");
      return;
    }

    if (phone && phone.length !== PHONE_DIGITS) {
      setError(`Phone number must be exactly ${PHONE_DIGITS} digits`);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await addEmployee({
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: email || undefined,
      department: department || undefined,
      phone: toStoredPhone(phone),
    });

    if (result.error) {
      setError(result.error);
    } else {
      setFirstName("");
      setLastName("");
      setEmail("");
      setDepartment("");
      setPhone("");
      router.refresh();
      onSuccess?.();
    }
    setLoading(false);
  };

  const selectClass =
    "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";
  const inputClass =
    "w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">First name *</label>
          <input
            maxLength={NAME_PART_MAX}
            type="text"
            required
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Last name *</label>
          <input
            maxLength={NAME_PART_MAX}
            type="text"
            required
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
          />
        </div>
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
            maxLength={EMAIL_MAX}
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Phone</label>
          <div className="flex items-center rounded-md border border-gray-200 focus-within:border-gray-400">
            <span className="pl-3 text-sm text-gray-500">+63</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="9XX XXX XXXX"
              value={formatPhone(phone)}
              onChange={(e) =>
                setPhone(normalizePhone(e.target.value))
              }
              className="w-full bg-transparent px-2 py-1.5 text-sm focus:outline-none"
            />
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading || !firstName.trim() || !lastName.trim()}
        className="rounded-md bg-gray-800 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-gray-700"
      >
        {loading ? "Adding..." : "Add current employee"}
      </button>
    </form>
  );
}
