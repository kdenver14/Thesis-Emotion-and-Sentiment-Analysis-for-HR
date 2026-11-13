"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FiUpload,
  FiGrid,
  FiUsers,
  FiSettings,
  FiFileText,
  FiBarChart2,
} from "react-icons/fi";
import { SignOutButton } from "./signout";
import { EditableName } from "./EditableName";
import { ChangePasswordModal } from "./ChangePasswordModal";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: FiGrid },
  { href: "/employees", label: "Employees", icon: FiUsers },
];

export default function Navigation({
  userName,
  userRole = "STAFF",
  userEmail,
}: {
  userName?: string;
  userRole?: string;
  userEmail?: string;
}) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    ...(userRole !== "DIRECTOR"
      ? [{ href: "/upload", label: "Upload", icon: FiUpload }]
      : []),
    ...BASE_NAV,
    // The quarterly report is the HR Director's alone; Managers compare
    // months from the dashboard instead.
    ...(userRole === "DIRECTOR"
      ? [{ href: "/reports", label: "Reports", icon: FiBarChart2 }]
      : []),
    ...(userRole === "MANAGER" || userRole === "DIRECTOR"
      ? [
          { href: "/admin/users", label: "Users", icon: FiSettings },
          { href: "/admin/audit", label: "Audit Log", icon: FiFileText },
        ]
      : []),
  ];

  return (
    <>
      <nav className="flex h-16 items-center justify-between border-b border-gray-200 px-6 sm:px-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  // Icons only below 1024px, where the labels would wrap.
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  title={label}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-gray-100 font-medium text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="hidden lg:block">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            {/* The email cannot be edited, so it always tells which account is
              signed in, even after a name change. */}
            <div className="flex min-w-0 flex-col items-end">
              {userRole === "MANAGER" ? (
                <EditableName initialName={userName ?? ""} />
              ) : (
                <span className="truncate text-xs font-medium text-gray-700">
                  {userName ?? "—"}
                </span>
              )}
              {userEmail && (
                <span
                  className="max-w-[18rem] truncate text-xs text-gray-500"
                  title={userEmail}
                >
                  {userEmail}
                </span>
              )}
            </div>
            <ChangePasswordModal />
          </div>
          <SignOutButton />
        </div>
      </nav>
      {/* Phones: the nav row has no room, so the signed-in account gets its own
        line. Wrapped, never truncated: every demo email shares the same
        prefix, so cutting it would hide the part that tells accounts apart. */}
      <div className="flex flex-col border-b border-gray-200 px-6 py-2 sm:hidden">
        <span className="text-xs font-medium text-gray-700">
          {userName ?? "—"}
        </span>
        {userEmail && (
          <span className="break-all text-xs text-gray-500">{userEmail}</span>
        )}
      </div>
    </>
  );
}
