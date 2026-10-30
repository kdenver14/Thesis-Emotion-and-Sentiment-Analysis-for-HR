import { FiActivity } from "react-icons/fi";

interface SessionSummaryProps {
  summary: string;
}

export function SessionSummary({ summary }: SessionSummaryProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-800">Session Summary</h3>
        <div className="flex items-center gap-1.5">
          <FiActivity className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500">AI-generated analysis</span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-gray-600">{summary}</p>
    </div>
  );
}
