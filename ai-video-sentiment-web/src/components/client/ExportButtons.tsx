"use client";

import { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiDownload, FiFileText } from "react-icons/fi";

interface ExportButtonsProps {
  sessionId?: string;
  aggregateParams?: { from?: string; to?: string };
  label?: string;
  userRole?: string;
}

// One Export button that opens the formats (PDF report, CSV data).
export function ExportButtons({
  sessionId,
  aggregateParams,
  label = "Export",
  userRole,
}: ExportButtonsProps) {
  const hideCSV = aggregateParams !== undefined && userRole === "DIRECTOR";
  const buildQuery = (type: "pdf" | "csv") => {
    const base = `/api/export/${type}`;
    const params = new URLSearchParams();
    if (sessionId) {
      params.set("sessionId", sessionId);
    } else if (aggregateParams) {
      params.set("type", "aggregate");
      if (aggregateParams.from) params.set("from", aggregateParams.from);
      if (aggregateParams.to) params.set("to", aggregateParams.to);
    }
    return `${base}?${params.toString()}`;
  };

  return (
    <ExportMenu
      label={label}
      pdfHref={buildQuery("pdf")}
      csvHref={hideCSV ? null : buildQuery("csv")}
    />
  );
}

// Disclosure (button + links), not an ARIA menu: Tab reaches each format, so
// no arrow-key handling is needed. Closes on outside click and Escape.
function ExportMenu({
  label,
  pdfHref,
  csvHref,
}: {
  label: string;
  pdfHref: string;
  csvHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FiDownload className="h-3.5 w-3.5" aria-hidden />
        {label}
        <FiChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-md">
          <a href={pdfHref} download onClick={() => setOpen(false)} className={item}>
            <FiDownload className="h-3.5 w-3.5 text-gray-400" aria-hidden />
            PDF report
          </a>
          {csvHref && (
            <a href={csvHref} download onClick={() => setOpen(false)} className={item}>
              <FiFileText className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              CSV data
            </a>
          )}
        </div>
      )}
    </div>
  );
}
