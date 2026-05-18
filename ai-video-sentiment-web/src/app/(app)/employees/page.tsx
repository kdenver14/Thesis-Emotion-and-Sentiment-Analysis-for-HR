import { FiPlus } from "react-icons/fi";
import { auth } from "~/server/auth";
import { getEmployees } from "~/actions/employees";
import { AddEmployeeForm } from "./AddEmployeeForm";
import { EmployeeList } from "./EmployeeList";

export default async function EmployeesPage() {
  const [employees, session] = await Promise.all([getEmployees(), auth()]);
  const role = session?.user?.role ?? "STAFF";
  const canManage = role !== "DIRECTOR";
  const seesAllUsers = role !== "STAFF";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
        {employees.length > 0 && (
          <span className="text-sm text-gray-400">{employees.length} total</span>
        )}
      </div>

      <div className={`grid gap-6 ${canManage ? "lg:grid-cols-3" : ""}`}>
        {/* Employee list */}
        <div className={canManage ? "lg:col-span-2" : ""}>
          <EmployeeList employees={employees} seesAllUsers={seesAllUsers} />
        </div>

        {/* Add employee form — MANAGER and STAFF only */}
        {canManage && (
          <div className="self-start rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FiPlus className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-medium text-gray-700">Add employee</h2>
            </div>
            <AddEmployeeForm />
          </div>
        )}
      </div>
    </div>
  );
}
