"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiEdit2, FiCheck, FiX } from "react-icons/fi";
import { updateEmployeeDemographicsAction } from "~/actions/employees";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"] as const;
const MIN_AGE = 18;
const MAX_AGE = 100;

interface EditDemographicsProps {
  employeeId: string;
  age: number | null;
  gender: string | null;
}

export function EditDemographics({
  employeeId,
  age,
  gender,
}: EditDemographicsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [ageDraft, setAgeDraft] = useState(age?.toString() ?? "");
  const [genderDraft, setGenderDraft] = useState(gender ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startEdit = () => {
    setAgeDraft(age?.toString() ?? "");
    setGenderDraft(gender ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = () => {
    let ageValue: number | null = null;
    if (ageDraft.trim()) {
      const parsed = Number(ageDraft);
      if (!Number.isInteger(parsed)) {
        setError("Age must be a whole number");
        return;
      }
      if (parsed < MIN_AGE) {
        setError(`Employee must be at least ${MIN_AGE} years old`);
        return;
      }
      if (parsed > MAX_AGE) {
        setError(`Age must be ${MAX_AGE} or below`);
        return;
      }
      ageValue = parsed;
    }

    startTransition(async () => {
      const result = await updateEmployeeDemographicsAction(employeeId, {
        age: ageValue,
        gender: genderDraft || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={MIN_AGE}
          max={MAX_AGE}
          step={1}
          placeholder={`${MIN_AGE}+`}
          value={ageDraft}
          onChange={(e) => setAgeDraft(e.target.value)}
          disabled={isPending}
          className="w-16 rounded border border-gray-300 bg-transparent px-1.5 py-0.5 text-sm focus:border-gray-500 focus:outline-none disabled:opacity-50"
        />
        <select
          value={genderDraft}
          onChange={(e) => setGenderDraft(e.target.value)}
          disabled={isPending}
          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-sm focus:border-gray-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">— Gender —</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={isPending}
          className="text-gray-500 hover:text-gray-900 disabled:opacity-50"
          aria-label="Save"
        >
          <FiCheck className="h-4 w-4" />
        </button>
        <button
          onClick={cancel}
          disabled={isPending}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          aria-label="Cancel"
        >
          <FiX className="h-4 w-4" />
        </button>
        {error && <span className="text-xs text-gray-600">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {age !== null && <span>{age} yrs</span>}
      {gender && <span>{gender}</span>}
      {age === null && !gender && (
        <span className="text-gray-400">Add age/gender</span>
      )}
      <button
        onClick={startEdit}
        className="flex items-center gap-1 text-gray-400 hover:text-gray-700"
        aria-label="Edit age and gender"
      >
        <FiEdit2 className="h-3.5 w-3.5" />
        <span className="text-xs">Edit</span>
      </button>
    </span>
  );
}
