"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  FiGrid,
  FiTrendingUp,
  FiUsers,
  FiPlus,
  FiX,
  FiMenu,
  FiLogOut,
} from "react-icons/fi";
import { signOut } from "next-auth/react";

const NAV_SECTIONS = [
  {
    label: "Assessments",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: FiGrid },
      { href: "/analytics", label: "Analytics", icon: FiTrendingUp },
    ],
  },
  {
    label: "Candidates",
    items: [{ href: "/employees", label: "All Staff", icon: FiUsers }],
  },
] as const;

interface SidebarProps {
  user: { name?: string | null; email?: string | null };
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const avatarChar = (
    user.name?.[0] ?? user.email?.[0] ?? "U"
  ).toUpperCase();

  const navContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-100 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white">
          HR
        </div>
        <span className="text-sm font-semibold text-gray-900">HR Suite</span>
      </div>

      {/* New Assessment CTA */}
      <div className="p-3">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          <FiPlus className="h-4 w-4" />
          New Assessment
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="label-section mb-1.5 px-2">{section.label}</p>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                    active
                      ? "border-l-2 border-slate-700 bg-slate-50 pl-[calc(0.5rem-2px)] font-medium text-slate-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User + sign-out */}
      <div className="border-t border-gray-100 p-3">
        <div className="mb-1 flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
            {avatarChar}
          </div>
          <div className="min-w-0">
            {user.name && (
              <p className="truncate text-xs font-medium text-gray-900">
                {user.name}
              </p>
            )}
            {user.email && (
              <p className="truncate text-xs text-gray-400">{user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
        >
          <FiLogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — fixed, 240px */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-64 lg:flex-col border-r border-gray-200 bg-white">
        {navContent}
      </div>

      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-700 text-xs font-bold text-white">
            HR
          </div>
          <span className="text-sm font-semibold text-gray-900">HR Suite</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <FiMenu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl lg:hidden">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <FiX className="h-5 w-5" />
            </button>
            {navContent}
          </div>
        </>
      )}
    </>
  );
}
