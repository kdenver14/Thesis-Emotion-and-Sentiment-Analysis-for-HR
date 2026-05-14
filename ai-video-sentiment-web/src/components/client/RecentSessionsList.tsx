import Link from "next/link";
import type { ParsedSession } from "~/server/repositories/session";

interface Props {
  sessions: ParsedSession[];
  seesAllUsers?: boolean;
}

function statusLabel(status: string): string | null {
  if (status === "PROCESSING") return "Processing";
  if (status === "FAILED") return "Failed";
  return null;
}

export function RecentSessionsList({ sessions, seesAllUsers = false }: Props) {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Recent sessions</h3>
        {sessions.length > 0 && (
          <Link
            href="/dashboard"
            className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
          >
            View all →
          </Link>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-xl border border-gray-200 p-4 text-sm text-gray-400">
          No sessions yet. Upload a video above to get started.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200">
          {sessions.map((s) => {
            const label = statusLabel(s.status);
            return (
              <li key={s.id}>
                <Link
                  href={`/dashboard/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-gray-900">
                      {s.title}
                    </span>
                    <span className="text-xs text-gray-500">
                      {s.sessionDate.toLocaleDateString("en-GB")}
                    </span>
                    {seesAllUsers && (
                      <span className="text-xs text-gray-600">
                        Interviewer: {s.interviewerName ?? s.handledBy.name ?? "—"}
                        {" · "}
                        Interviewee: {s.employee?.name ?? "Unassigned"}
                      </span>
                    )}
                  </div>
                  {label && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
