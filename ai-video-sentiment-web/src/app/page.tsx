import Link from "next/link";
import { HeroBackground } from "~/components/client/HeroBackground";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Nav */}
      <nav className="flex h-16 items-center justify-between border-b border-gray-200 px-6 sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
            S
          </div>
          <span className="text-lg font-semibold tracking-tight">Sentr</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <HeroBackground />
        <p className="relative mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">
          Made for{" "}
          <a
            href="https://www.blastasia.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-gray-600"
          >
            Blastasia
          </a>
        </p>
        <h1 className="relative max-w-2xl text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
          Your AI Conversation Analyst
        </h1>
        <p className="relative mt-6 max-w-lg text-lg leading-relaxed text-gray-500">
          AI-powered emotion and sentiment analysis for recorded interviews and
          conversations.
        </p>
        <div className="relative mt-10">
          <Link
            href="/login"
            className="rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Log in
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-900 text-xs font-bold text-white">
              S
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900">
              Sentr
            </span>
          </div>
          <span className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Sentr
          </span>
        </div>
      </footer>
    </div>
  );
}
