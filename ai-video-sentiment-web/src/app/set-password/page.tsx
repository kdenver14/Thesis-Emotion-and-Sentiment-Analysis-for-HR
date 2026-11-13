import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { getMustChangePassword } from "~/server/repositories/user";
import { SetPasswordForm } from "./SetPasswordForm";

// Only for an account still on its emailed temporary password; everyone else
// goes straight to the dashboard.
export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await getMustChangePassword(session.user.id))) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              Choose your password
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              You signed in with a temporary password. Set your own to continue.
            </p>
          </div>
          <SetPasswordForm />
        </div>
      </main>
    </div>
  );
}
