import { auth } from "~/server/auth";
import Sidebar from "~/components/client/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = {
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
  };

  return (
    <div className="min-h-screen">
      <Sidebar user={user} />
      {/* pt-14 offsets mobile top bar; lg:pl-64 offsets desktop sidebar */}
      <main className="min-h-screen pt-14 lg:pl-64 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
