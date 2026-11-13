import { notFound } from "next/navigation";
import { FiDownload } from "react-icons/fi";
import { getQuarterlyReport } from "~/actions/reports";

export default async function ReportsPage() {
  const report = await getQuarterlyReport();
  if (!report) notFound();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-gray-900">
            Quarterly report
          </h1>
          <p className="text-sm text-gray-500">
            The last four calendar quarters across all sessions. Each change is
            against the quarter before it.
          </p>
        </div>
        <a
          href="/api/export/pdf?report=quarterly"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <FiDownload className="h-4 w-4" aria-hidden />
          Download PDF
        </a>
      </div>

      <p className="text-sm text-gray-700">{report.headline}</p>

      {/* A wide table scrolls inside its own box on phones, never the page. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Quarterly report table"
        className="overflow-x-auto rounded-xl border border-gray-200"
      >
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Quarterly report</caption>
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="sr-only">Measure</span>
              </th>
              {report.columns.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2 font-medium"
                >
                  <span className="block text-gray-900">{col.label}</span>
                  <span className="block font-normal">
                    {col.months}
                    {col.toDate ? ", to date" : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.rows.map((row) => (
              <tr key={row.metric}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-2.5 text-left align-top font-normal text-gray-600"
                >
                  {row.metric}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={report.columns[i]?.label ?? i}
                    className="px-4 py-2.5 align-top"
                  >
                    <span className="block font-medium tabular-nums text-gray-900">
                      {cell.value}
                    </span>
                    {cell.change && (
                      <span className="block text-xs tabular-nums text-gray-500">
                        {cell.change}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Sessions count in the quarter of their session date. Every percentage is
        a share of lines of speech, the same as the dashboard, except the top
        expressive emotion, which is a share of expressive lines.
      </p>
    </div>
  );
}
