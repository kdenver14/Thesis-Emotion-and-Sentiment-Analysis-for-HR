"use client";

import { FiDownload, FiFileText } from "react-icons/fi";

interface ExportButtonsProps {
  sessionId?: string;
  aggregateParams?: { from?: string; to?: string };
  label?: string;
}

export function ExportButtons({
  sessionId,
  aggregateParams,
  label = "Export",
}: ExportButtonsProps) {
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
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{label}:</span>
      <a
        href={buildQuery("pdf")}
        download
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FiDownload className="h-3.5 w-3.5" />
        PDF
      </a>
      <a
        href={buildQuery("csv")}
        download
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FiFileText className="h-3.5 w-3.5" />
        CSV
      </a>
    </div>
  );
}
