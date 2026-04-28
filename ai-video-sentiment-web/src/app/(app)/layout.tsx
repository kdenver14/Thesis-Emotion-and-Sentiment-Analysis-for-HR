import Navigation from "~/components/client/Navigation";
import { auth } from "~/server/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userName = session?.user?.name ?? undefined;

  return (
    <div className="min-h-screen bg-white">
      <Navigation userName={userName} />
      <main>{children}</main>
    </div>
  );
}
