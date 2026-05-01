import Navigation from "~/components/client/Navigation";
import { auth } from "~/server/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? undefined;
  const userRole = session?.user?.role ?? "STAFF";

  return (
    <div className="min-h-screen bg-white">
      <Navigation userName={userName} userRole={userRole} />
      <main>{children}</main>
    </div>
  );
}
