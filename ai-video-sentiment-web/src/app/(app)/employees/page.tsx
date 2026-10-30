import { auth } from "~/server/auth";
import { getEmployees } from "~/actions/employees";
import { AddEmployeeDisclosure } from "./AddEmployeeDisclosure";
import { EmployeeList } from "./EmployeeList";

export default async function EmployeesPage() {
  const [employees, session] = await Promise.all([getEmployees(), auth()]);
  const role = session?.user?.role ?? "STAFF";
  const canManage = role !== "DIRECTOR";
  const seesAllUsers = role !== "STAFF";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <EmployeeList
        employees={employees}
        seesAllUsers={seesAllUsers}
        actions={canManage ? <AddEmployeeDisclosure /> : undefined}
      />
    </div>
  );
}
