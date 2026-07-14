export const ADMIN_ROLES = [
  "admin",
  "content",
  "registration",
  "accommodation",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminArea =
  | "registration"
  | "accommodation"
  | "content"
  | "emails"
  | "team"
  | "seed"
  | "audit";

export const AREA_ROLES: Record<AdminArea, readonly AdminRole[]> = {
  registration: ["admin", "registration"],
  accommodation: ["admin", "accommodation"],
  content: ["admin", "content"],
  emails: ["admin"],
  team: ["admin"],
  seed: ["admin"],
  audit: ["admin"],
};

export function isAdminRole(role: string | undefined | null): role is AdminRole {
  return (
    role === "admin" ||
    role === "content" ||
    role === "registration" ||
    role === "accommodation"
  );
}

export function canAccessArea(
  role: string | undefined | null,
  area: AdminArea,
): boolean {
  if (!isAdminRole(role)) return false;
  return AREA_ROLES[area].includes(role);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: "Admin",
  content: "Content",
  registration: "Registration",
  accommodation: "Accommodation",
};
