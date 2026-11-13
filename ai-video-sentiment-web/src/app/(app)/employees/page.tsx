import { auth } from "~/server/auth";
import { getArchivedEmployees, getEmployees } from "~/actions/employees";
import { AddEmployeeDisclosure } from "./AddEmployeeDisclosure";
import { EmployeeList } from "./EmployeeList";

export default async function EmployeesPage() {
  const [employees, archived, session] = await Promise.all([
    getEmployees(),
    getArchivedEmployees(),
    auth(),
  ]);
  const role = session?.user?.role ?? "STAFF";
  const canManage = role !== "DIRECTOR";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <EmployeeList
        employees={employees}
        archived={archived}
        actions={canManage ? <AddEmployeeDisclosure /> : undefined}
      />
    </div>
  );
}
