import { ResendForm } from "./ResendForm";

interface PageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function ResendVerificationPage({
  searchParams,
}: PageProps) {
  const { email } = await searchParams;

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Verify your email
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your account is not verified yet. Request a new verification link.
            </p>
          </div>
          <ResendForm defaultEmail={email ?? ""} />
        </div>
      </main>
    </div>
  );
}
