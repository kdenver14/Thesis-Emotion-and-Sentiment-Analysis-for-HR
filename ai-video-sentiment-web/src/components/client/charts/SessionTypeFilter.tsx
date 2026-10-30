"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FiChevronDown } from "react-icons/fi";
import { SESSION_TYPE_LABELS } from "~/types/analysis";

interface Props {
  value: string;
  options: string[];
}

// Page-level scope control. It writes ?type= and the dashboard reads that on
// the server, so the emotion donut, the trend chart and the sessions table all
// narrow together. It lives in the page toolbar rather than inside the table
// because its effect is not limited to the table. router.replace overwrites
// history (no back-button spam per filter change) and other params survive via
// URLSearchParams.
export function SessionTypeFilter({ value, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string): void {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "all") params.delete("type");
    else params.set("type", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // appearance-none plus an explicit chevron so the control matches the other
  // toolbar buttons instead of rendering the browser's default select chrome.
  return (
    <div className="relative">
      <select
        aria-label="Filter by session type"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-3 pr-9 text-sm text-gray-700 hover:bg-gray-50 focus:border-gray-400 focus:outline-none"
      >
        <option value="all">All types</option>
        {options.map((t) => (
          <option key={t} value={t}>
            {SESSION_TYPE_LABELS[t] ?? t}
          </option>
        ))}
      </select>
      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  );
}
