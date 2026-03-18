import Navigation from "~/components/client/Navigation";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main>{children}</main>
    </div>
  );
}
