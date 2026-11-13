import Link from "next/link";
import { isResetLinkUsable } from "~/server/services/verification";
import { ResetForm } from "./ResetForm";

interface PageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // A repeated ?token= arrives as an array: treated as no token.
  const token = typeof params.token === "string" ? params.token : undefined;
  const usable = token ? await isResetLinkUsable(token) : false;

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Set a new password
            </h2>
            {usable && (
              <p className="mt-2 text-sm text-gray-600">
                Choose a new password for your account.
              </p>
            )}
          </div>
          {usable ? (
            <ResetForm token={token ?? ""} />
          ) : (
            <div className="space-y-6 text-center">
              <p
                role="alert"
                className="rounded-md bg-red-50 p-4 text-sm text-red-500"
              >
                This reset link is invalid or has expired.
              </p>
              <p className="flex justify-center gap-4 text-sm">
                <Link
                  href="/forgot-password"
                  className="text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Request a new link
                </Link>
                <Link
                  href="/login"
                  className="text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Back to sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
