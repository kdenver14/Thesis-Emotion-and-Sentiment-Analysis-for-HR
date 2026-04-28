"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiUpload, FiGrid, FiTrendingUp, FiUsers } from "react-icons/fi";
import { SignOutButton } from "./signout";

const NAV_ITEMS = [
  { href: "/", label: "Upload", icon: FiUpload },
  { href: "/dashboard", label: "Dashboard", icon: FiGrid },
  { href: "/analytics", label: "Analytics", icon: FiTrendingUp },
  { href: "/employees", label: "Employees", icon: FiUsers },
] as const;

export default function Navigation({ userName }: { userName?: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-16 items-center justify-between border-b border-gray-200 px-6 sm:px-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:block">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {userName && (
          <span className="hidden text-sm text-gray-500 sm:block">
            {userName}
          </span>
        )}
        <SignOutButton />
      </div>
    </nav>
  );
}
