import { ResetForm } from "./ResetForm";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Set a new password
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Choose a new password for your account.
            </p>
          </div>
          <ResetForm token={token ?? ""} />
        </div>
      </main>
    </div>
  );
}
