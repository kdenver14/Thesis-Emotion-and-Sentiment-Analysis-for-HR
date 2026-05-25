"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { loginSchema, type LoginSchema } from "~/schemas/auth";
import { requestLoginCode, verifyLoginCode } from "~/actions/auth";

type Step = "credentials" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<Step>("credentials");
  const [remember, setRemember] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [code, setCode] = useState<string>("");
  // Held after step 1 so step 2 / resend can replay the credentials without
  // re-prompting (kept in memory only, never persisted).
  const [creds, setCreds] = useState<LoginSchema | null>(null);

  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Completes the NextAuth session. With a proof, authorize() consumes it;
  // without one it relies on the trusted-device cookie just set / matched.
  async function finishSignIn(
    email: string,
    password: string,
    proof?: string,
  ) {
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
      ...(proof ? { proof } : {}),
    });
    if (!result?.error) {
      router.push("/");
    } else {
      setError("Could not complete sign-in. Please try again.");
    }
  }

  async function onCredentials(data: LoginSchema) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await requestLoginCode(data.email, data.password);
      if (res.step === "unverified") {
        router.push(
          `/resend-verification?email=${encodeURIComponent(data.email)}`,
        );
        return;
      }
      if (res.step === "invalid") {
        setError("Invalid email or password");
        return;
      }
      if (res.step === "error") {
        setError(res.error ?? "Something went wrong");
        return;
      }
      setCreds(data);
      if (res.step === "trusted") {
        await finishSignIn(data.email, data.password);
        return;
      }
      // code_sent
      setStep("code");
      setNotice("We emailed a 6-digit code. It expires in 10 minutes.");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    if (!creds) return;
    setLoading(true);
    setError("");
    try {
      const res = await verifyLoginCode(
        creds.email,
        creds.password,
        code.trim(),
        remember,
      );
      if (!res.ok || !res.proof) {
        setError(res.error ?? "Incorrect code.");
        return;
      }
      await finishSignIn(creds.email, creds.password, res.proof);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!creds) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const res = await requestLoginCode(creds.email, creds.password);
      if (res.step === "code_sent") {
        setNotice("A new code is on its way.");
      } else if (res.step === "error") {
        setError(res.error ?? "Something went wrong");
      } else {
        setError("Could not resend the code. Please start over.");
      }
    } finally {
      setLoading(false);
    }
  }

  function backToCredentials() {
    setStep("credentials");
    setCode("");
    setError("");
    setNotice("");
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="flex h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 px-4">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="mt-2 text-sm text-gray-600">
              {step === "credentials"
                ? "Please sign in to your account"
                : "Enter the code we emailed you"}
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-500">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-600">
              {notice}
            </div>
          )}

          {step === "credentials" ? (
            <form
              className="mt-8 space-y-6"
              onSubmit={form.handleSubmit(onCredentials)}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <input
                    {...form.register("email")}
                    type="email"
                    placeholder="you@example.com"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none"
                  />
                  {form.formState.errors.email && (
                    <p className="mt-1 text-sm text-red-500">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      {...form.register("password")}
                      type={showPassword ? "text" : "password"}
                      placeholder="********"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 mt-1 flex items-center px-3 text-gray-500 hover:text-gray-800"
                    >
                      {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="mt-1 text-sm text-red-500">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 accent-gray-800"
                  />
                  Remember this device for 30 days
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? "Continuing..." : "Continue"}
              </button>

              <p className="text-center text-sm">
                <Link
                  href="/forgot-password"
                  className="text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Forgot password?
                </Link>
              </p>
            </form>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={onCode}>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-sm tracking-[0.4em] placeholder-gray-400 shadow-sm focus:border-gray-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="flex w-full justify-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify and sign in"}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={backToCredentials}
                  className="text-gray-500 hover:text-gray-800 hover:underline"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onResend}
                  disabled={loading}
                  className="text-gray-500 hover:text-gray-800 hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
