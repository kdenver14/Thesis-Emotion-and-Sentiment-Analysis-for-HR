"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiUpload, FiGrid, FiUsers, FiSettings, FiFileText } from "react-icons/fi";
import { SignOutButton } from "./signout";
import { EditableName } from "./EditableName";
import { ChangePasswordModal } from "./ChangePasswordModal";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: FiGrid },
  { href: "/employees", label: "Employees", icon: FiUsers },
];

export default function Navigation({
  userName,
  userRole = "STAFF",
}: {
  userName?: string;
  userRole?: string;
}) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    ...(userRole !== "DIRECTOR" ? [{ href: "/upload", label: "Upload", icon: FiUpload }] : []),
    ...BASE_NAV,
    ...(userRole === "MANAGER" || userRole === "DIRECTOR"
      ? [
          { href: "/admin/users", label: "Users", icon: FiSettings },
          { href: "/admin/audit", label: "Audit Log", icon: FiFileText },
        ]
      : []),
  ];

  return (
    <nav className="flex h-16 items-center justify-between border-b border-gray-200 px-6 sm:px-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
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
        <div className="hidden sm:flex items-center gap-2">
          {userRole === "MANAGER" ? (
            <EditableName initialName={userName ?? ""} />
          ) : (
            <span className="truncate text-xs text-gray-500">{userName ?? "—"}</span>
          )}
          <ChangePasswordModal />
        </div>
        <SignOutButton />
      </div>
    </nav>
  );
}
