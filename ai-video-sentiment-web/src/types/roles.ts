export const ROLES = ["MANAGER", "DIRECTOR", "STAFF"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

export function asRole(value: unknown): Role {
  return isRole(value) ? value : "STAFF";
}

export const ROLE_LABELS: Record<Role, string> = {
  MANAGER: "HR Manager",
  DIRECTOR: "HR Director",
  STAFF: "HR Staff",
};
