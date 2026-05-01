import { notFound } from "next/navigation";
import { FiPlus } from "react-icons/fi";
import { auth } from "~/server/auth";
import { getUsers } from "~/actions/users";
import { CreateUserForm } from "./CreateUserForm";
import { UserList } from "./UserList";

export default async function UsersPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") notFound();

  const isDirector = role === "DIRECTOR";
  const users = await getUsers();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">User Accounts</h1>
        {users.length > 0 && (
          <span className="text-sm text-gray-400">{users.length} total</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={isDirector ? "lg:col-span-3" : "lg:col-span-2"}>
          <UserList users={users} readOnly={isDirector} />
        </div>

        {!isDirector && (
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FiPlus className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-medium text-gray-700">Create account</h2>
            </div>
            <CreateUserForm />
          </div>
        )}
      </div>
    </div>
  );
}
