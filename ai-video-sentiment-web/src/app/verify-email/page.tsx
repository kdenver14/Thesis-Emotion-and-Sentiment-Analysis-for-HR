import Link from "next/link";
import { confirmEmail } from "~/server/services/verification";

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const result = token
    ? await confirmEmail(token)
    : { ok: false, alreadyVerified: false };

  const heading = result.ok
    ? result.alreadyVerified
      ? "Already verified"
      : "Email verified"
    : "Verification failed";
  const message = result.ok
    ? result.alreadyVerified
      ? "This account is already verified. You can sign in."
      : "Your email is confirmed. You can now sign in to your account."
    : "This verification link is invalid or has expired. Sign in to request a new one.";

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-6 px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900">{heading}</h2>
          <p className="text-sm text-gray-600">{message}</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
