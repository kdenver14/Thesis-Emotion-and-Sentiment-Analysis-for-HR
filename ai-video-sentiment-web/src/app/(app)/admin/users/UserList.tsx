"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IconType } from "react-icons";
import { useRouter } from "next/navigation";
import {
  FiArchive,
  FiArrowDown,
  FiArrowUp,
  FiCheck,
  FiCopy,
  FiEdit2,
  FiMoreHorizontal,
  FiRotateCcw,
  FiSearch,
  FiUserCheck,
  FiX,
} from "react-icons/fi";
import {
  archiveUser,
  changeUserRole,
  restoreUser,
  updateUserName,
} from "~/actions/users";
import type { UserRow } from "~/actions/users";
import { ROLE_LABELS, ROLES, type Role } from "~/types/roles";
import { useConfirm } from "~/components/client/ConfirmDialog";

// Archived accounts of every role share one section, below the others.
const ARCHIVED_GROUP = "ARCHIVED";

// Director last: there is only one, and Managers and Staff are managed most.
const ROLE_ORDER: readonly string[] = ["MANAGER", "STAFF", "DIRECTOR"];

const SECTION_LABEL: Record<string, string> = {
  MANAGER: "HR Managers",
  STAFF: "HR Staff",
  DIRECTOR: "HR Director",
};

// A role section shows this many users until "Show N more" is clicked, so
// one large group cannot push the others off screen.
const GROUP_LIMIT = 5;

// How long "Copied" shows after Copy details.
const COPIED_MS = 1500;

// Directors are view-only and never handle sessions, so their count is
// always 0 and not shown.
function hasSessions(role: string): boolean {
  return role !== "DIRECTOR";
}

type SortColumn = "name" | "email" | "sessions" | "createdAt";
type SortDir = "asc" | "desc";

// One template for the column header and every row; phones get no columns,
// each row stacks name over email. The role is the section, not a column.
const COLUMNS =
  "sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_4.5rem_6rem] sm:gap-4";

const HEADERS: { column: SortColumn; label: string }[] = [
  { column: "name", label: "Name" },
  { column: "email", label: "Email" },
  { column: "sessions", label: "Sessions" },
  { column: "createdAt", label: "Added on" },
];

// null is a blank cell: it sorts last in either direction.
const SORT_VALUE: Record<SortColumn, (u: UserRow) => string | number | null> = {
  name: (u) => u.name ?? null,
  email: (u) => u.email ?? null,
  sessions: (u) => u.sessionsHandled,
  createdAt: (u) => u.createdAt?.getTime() ?? null,
};

// Ties fall back to name.
function compareBy(column: SortColumn, dir: SortDir) {
  return (a: UserRow, b: UserRow): number => {
    const tie = (a.name ?? "").localeCompare(b.name ?? "");
    const x = SORT_VALUE[column](a);
    const y = SORT_VALUE[column](b);
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
      return tie;
    }
    const cmp =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return (dir === "asc" ? cmp : -cmp) || tie;
  };
}

// Role sections in ROLE_ORDER, then any unexpected role as "Other", then
// every archived account.
function groupByRole(
  users: UserRow[],
): { role: string; label: string; users: UserRow[] }[] {
  const active = users.filter((u) => !u.archived);
  const known = ROLE_ORDER.map((role) => ({
    role,
    label: SECTION_LABEL[role] ?? role,
    users: active.filter((u) => u.role === role),
  }));
  const other = active.filter((u) => !ROLE_ORDER.includes(u.role));
  return [
    ...known,
    { role: "OTHER", label: "Other", users: other },
    {
      role: ARCHIVED_GROUP,
      label: "Archived",
      users: users.filter((u) => u.archived),
    },
  ].filter((g) => g.users.length > 0);
}

type MenuItem = {
  label: string;
  icon: IconType;
  onSelect: () => void;
};

// Row actions behind one "⋯" button, same disclosure pattern as the Export
// menu: Tab reaches each item; closes on outside click and Escape.
function RowMenu({
  label,
  items,
  disabled,
}: {
  label: string;
  items: MenuItem[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
      >
        <FiMoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-md">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none`}
            >
              <item.icon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One user row. The row shows everything there is to know; actions live in
// the "⋯" menu, and Rename edits the name in place.
function UserRowItem({
  user,
  readOnly,
  isSelf,
  directorTaken,
}: {
  user: UserRow;
  readOnly?: boolean;
  // Managers cannot change their own role or archive themselves.
  isSelf: boolean;
  // Only one active HR Director at a time.
  directorTaken: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.name ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { confirm, notify } = useConfirm();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const name = user.name ?? "this user";

  const cancelRename = () => {
    setEditing(false);
    setDraft(user.name ?? "");
  };

  const saveName = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === user.name) {
      cancelRename();
      return;
    }
    setBusy(true);
    const result = await updateUserName(user.id, trimmed);
    setBusy(false);
    if (result.error) {
      void notify(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  const copyDetails = () => {
    const text = `Name: ${user.name ?? ""}\nEmail: ${user.email ?? ""}\nRole: ${roleLabel}`;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch(() => void notify("Could not copy to the clipboard."));
  };

  // Asks first, then runs the action and reloads the list.
  const confirmAndRun = async (
    question: { message: string; confirmLabel: string; destructive?: boolean },
    action: (id: string) => Promise<{ error?: string }>,
  ) => {
    if (!(await confirm(question))) return;
    setBusy(true);
    try {
      const result = await action(user.id);
      if (result.error) {
        void notify(result.error);
        return;
      }
      router.refresh();
    } catch {
      void notify("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const roleItems: MenuItem[] = ROLES.filter(
    (r) => r !== user.role && !(r === "DIRECTOR" && directorTaken),
  ).map((r: Role) => ({
    label: `Make ${ROLE_LABELS[r]}`,
    icon: FiUserCheck,
    onSelect: () =>
      void confirmAndRun(
        {
          message: `Change ${name} to ${ROLE_LABELS[r]}? It applies on their next page load.`,
          confirmLabel: "Change role",
        },
        (id) => changeUserRole(id, r),
      ),
  }));

  const copyItem: MenuItem = {
    label: "Copy details",
    icon: FiCopy,
    onSelect: copyDetails,
  };

  const items: MenuItem[] = user.archived
    ? [
        ...(!readOnly
          ? [
              {
                label: "Restore account",
                icon: FiRotateCcw,
                onSelect: () =>
                  void confirmAndRun(
                    {
                      message: `Restore ${name}? They can sign in again as ${roleLabel}.`,
                      confirmLabel: "Restore",
                    },
                    restoreUser,
                  ),
              },
            ]
          : []),
        copyItem,
      ]
    : [
        ...(!readOnly
          ? [
              {
                label: "Rename",
                icon: FiEdit2,
                onSelect: () => {
                  setDraft(user.name ?? "");
                  setEditing(true);
                },
              },
            ]
          : []),
        ...(!readOnly && !isSelf ? roleItems : []),
        copyItem,
        // An HR Manager is demoted first, so Managers cannot archive each
        // other by accident.
        ...(!readOnly && !isSelf && user.role !== "MANAGER"
          ? [
              {
                label: "Archive account",
                icon: FiArchive,
                onSelect: () =>
                  void confirmAndRun(
                    {
                      message: `Archive ${name}? They can no longer sign in. Their sessions and employees stay, and you can restore them later.`,
                      confirmLabel: "Archive",
                      destructive: true,
                    },
                    archiveUser,
                  ),
              },
            ]
          : []),
      ];

  return (
    <li className="flex items-center gap-2 pl-4 pr-2 last:rounded-b-xl hover:bg-gray-50">
      <div className={`min-w-0 flex-1 py-2.5 text-sm ${COLUMNS}`}>
        {editing ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") cancelRename();
              }}
              disabled={busy}
              aria-label={`New name for ${user.name ?? "user"}`}
              className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={busy}
              aria-label="Save name"
              className="p-0.5 text-gray-500 hover:text-gray-900 disabled:opacity-50"
            >
              <FiCheck className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelRename}
              disabled={busy}
              aria-label="Cancel rename"
              className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-50"
            >
              <FiX className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <span className="block truncate font-medium text-gray-900">
            {user.name ?? "—"}
            {/* The Archived section mixes roles, so it names each one. */}
            {user.archived && (
              <span className="ml-1.5 text-xs font-normal text-gray-500">
                {roleLabel}
              </span>
            )}
          </span>
        )}
        <span className="block truncate text-xs text-gray-500 sm:text-sm sm:text-gray-600">
          {user.email ?? "—"}
        </span>
        <span className="hidden tabular-nums text-gray-600 sm:block">
          {hasSessions(user.role) ? user.sessionsHandled : ""}
        </span>
        <span className="hidden tabular-nums text-gray-600 sm:block">
          {user.createdAt ? user.createdAt.toLocaleDateString("en-GB") : "—"}
        </span>
      </div>
      <span aria-live="polite" className="text-xs text-gray-500">
        {copied ? "Copied" : ""}
      </span>
      <RowMenu
        label={`Actions for ${user.name ?? "user"}`}
        items={items}
        disabled={busy}
      />
    </li>
  );
}

export function UserList({
  users,
  readOnly,
  currentUserId,
  actions,
}: {
  users: UserRow[];
  readOnly?: boolean;
  currentUserId: string;
  // Page-level action (the create-account button), placed in the toolbar row.
  actions?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({
    column: "name",
    dir: "asc",
  });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Archived accounts stay out of the list unless asked for (to restore one).
  const [showArchived, setShowArchived] = useState(false);
  const hasArchived = users.some((u) => u.archived);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const matches = users.filter(
      (u) =>
        (showArchived || !u.archived) &&
        (!q ||
          (u.name?.toLowerCase().includes(q) ?? false) ||
          (u.email?.toLowerCase().includes(q) ?? false)),
    );
    return groupByRole(matches.sort(compareBy(sort.column, sort.dir)));
  }, [users, q, sort, showArchived]);

  // Clicking the active column flips it; a new column starts A to Z, or
  // highest/newest first for the counts and dates.
  const sortBy = (column: SortColumn) =>
    setSort((s) =>
      s.column === column
        ? { column, dir: s.dir === "asc" ? "desc" : "asc" }
        : {
            column,
            dir:
              column === "sessions" || column === "createdAt" ? "desc" : "asc",
          },
    );

  const directorTaken = users.some((u) => u.role === "DIRECTOR" && !u.archived);

  const showGroup = (role: string) =>
    setOpenGroups((prev) => new Set(prev).add(role));

  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actions && <div className="flex justify-end">{actions}</div>}
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No users yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search name or email"
            aria-label="Search users"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-200 py-1.5 pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none"
          />
        </div>
        {actions}
      </div>

      {groups.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
          No users match your search.
        </div>
      ) : (
        // Each role gets its own heading and box with space between, so a
        // section can never be mistaken for a row (one shared box made the
        // headings blend into the user rows).
        <div className="flex flex-col gap-6 pt-2">
          {groups.map((group) => {
            // A search shows every match; otherwise long groups are capped.
            const capped = !q && !openGroups.has(group.role);
            const visible = capped
              ? group.users.slice(0, GROUP_LIMIT)
              : group.users;
            const hidden = group.users.length - visible.length;
            return (
              <section
                key={group.role}
                aria-labelledby={`role-${group.role}`}
                className="flex flex-col gap-2"
              >
                <h3
                  id={`role-${group.role}`}
                  className="px-1 text-sm font-semibold text-gray-900"
                >
                  {group.label}
                </h3>
                <div className="rounded-xl border border-gray-200">
                  {/* Column headers double as the sort control; one sort
                    applies inside every section. */}
                  <div className="hidden items-center gap-2 rounded-t-xl border-b border-gray-200 bg-gray-50 py-2 pl-4 pr-2 text-xs font-medium text-gray-500 sm:flex">
                    <div className={`min-w-0 flex-1 ${COLUMNS}`}>
                      {HEADERS.map(({ column, label }) => {
                        // Keep the cell so "Added on" lines up with the other
                        // sections; Directors just get no Sessions heading.
                        if (column === "sessions" && !hasSessions(group.role)) {
                          return <span key={column} />;
                        }
                        const active = sort.column === column;
                        const Arrow =
                          sort.dir === "asc" ? FiArrowUp : FiArrowDown;
                        return (
                          <button
                            key={column}
                            type="button"
                            onClick={() => sortBy(column)}
                            className={`flex items-center gap-1 text-left hover:text-gray-900 ${active ? "text-gray-900" : ""}`}
                          >
                            {label}
                            {active && (
                              <>
                                <Arrow className="h-3 w-3" aria-hidden />
                                <span className="sr-only">
                                  (sorted{" "}
                                  {sort.dir === "asc"
                                    ? "ascending"
                                    : "descending"}
                                  )
                                </span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {/* Width of the row's "⋯" button, so columns line up. */}
                    <span className="w-7 shrink-0" />
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {visible.map((u) => (
                      <UserRowItem
                        key={u.id}
                        user={u}
                        readOnly={readOnly}
                        isSelf={u.id === currentUserId}
                        directorTaken={directorTaken}
                      />
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => showGroup(group.role)}
                      className="w-full rounded-b-xl border-t border-gray-100 px-4 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Show {hidden} more
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {hasArchived && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          aria-expanded={showArchived}
          className="w-fit px-1 text-xs text-gray-500 hover:text-gray-900 hover:underline"
        >
          {showArchived ? "Hide archived accounts" : "Show archived accounts"}
        </button>
      )}
    </div>
  );
}
