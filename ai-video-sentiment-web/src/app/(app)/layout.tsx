import { redirect } from "next/navigation";
import Navigation from "~/components/client/Navigation";
import { ConfirmProvider } from "~/components/client/ConfirmDialog";
import { auth } from "~/server/auth";
import { getMustChangePassword } from "~/server/repositories/user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // No session here despite a login cookie: the account was archived or
  // removed (the jwt callback ended it).
  if (!session?.user?.id) redirect("/login");
  // Read from the database on every page, not the login token: an account
  // created with a temporary password must set its own before anything else.
  if (await getMustChangePassword(session.user.id)) {
    redirect("/set-password");
  }
  const userName = session?.user?.name ?? undefined;
  const userRole = session?.user?.role ?? "STAFF";
  const userEmail = session?.user?.email ?? undefined;

  return (
    <div className="min-h-screen bg-white">
      <Navigation
        userName={userName}
        userRole={userRole}
        userEmail={userEmail}
      />
      <main>
        <ConfirmProvider>{children}</ConfirmProvider>
      </main>
    </div>
  );
}
