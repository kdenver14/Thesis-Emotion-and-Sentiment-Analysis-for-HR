import Link from "next/link";
import { getEmployees } from "~/actions/employees";
import { AddEmployeeForm } from "./AddEmployeeForm";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function EmployeesPage() {
  const employees = await getEmployees();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
        {employees.length > 0 && (
          <span className="text-sm text-gray-400">{employees.length} total</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Employee list */}
        <div className="lg:col-span-2">
          {employees.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
              No employees yet — add one to get started
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {employees.map((emp) => (
                <Link
                  key={emp.id}
                  href={`/employees/${emp.id}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <span className="text-xs font-medium text-gray-600">
                      {getInitials(emp.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {emp.name}
                      </span>
                      <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                        {emp.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {[emp.role, emp.department, emp.email]
                        .filter(Boolean)
                        .join(" · ") || "No details"}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    View →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Add employee */}
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            Add employee
          </h2>
          <AddEmployeeForm />
        </div>
      </div>
    </div>
  );
}
