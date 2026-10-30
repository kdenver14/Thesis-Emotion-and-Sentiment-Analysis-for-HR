import { notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { getUsers } from "~/actions/users";
import { CreateUserDisclosure } from "./CreateUserDisclosure";
import { UserList } from "./UserList";

export default async function UsersPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "MANAGER" && role !== "DIRECTOR") notFound();

  const isDirector = role === "DIRECTOR";
  const users = await getUsers();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <UserList
        users={users}
        readOnly={isDirector}
        actions={isDirector ? undefined : <CreateUserDisclosure />}
      />
    </div>
  );
}
