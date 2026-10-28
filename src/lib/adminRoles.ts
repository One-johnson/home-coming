export const ADMIN_ROLES = [
  "admin",
  "content",
  "registration",
  "accommodation",
  "finance",
] as const;

/**
 * Phase 2 §2 venue staff. They authenticate like admins but work only in the
 * arrival surface (/admin/arrival) with server-enforced, role-specific powers:
 *
 * - room_assignment: rooms, assignments, changes, check-in/out, keys, views.
 * - checkin: search, check in/out, keys, status — never assign or publish.
 */
export const VENUE_STAFF_ROLES = ["room_assignment", "checkin"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type VenueStaffRole = (typeof VENUE_STAFF_ROLES)[number];
export type StaffRole = AdminRole | VenueStaffRole;

export type AdminArea =
  | "registration"
  | "accommodation"
  | "content"
  | "emails"
  | "team"
  | "seed"
  | "audit"
  | "settings";

export const AREA_ROLES: Record<AdminArea, readonly StaffRole[]> = {
  registration: ["admin", "registration", "finance"],
  // Room-assignment staff own the room inventory, so they reach the
  // accommodation console — the page shows them the Rooms and Review flags
  // tabs only, not bookings review or payment-on-arrival.
  accommodation: ["admin", "accommodation", "room_assignment"],
  content: ["admin", "content"],
  emails: ["admin"],
  team: ["admin"],
  seed: ["admin"],
  audit: ["admin", "finance"],
  settings: ["admin"],
};

export function isAdminRole(role: string | undefined | null): role is AdminRole {
  return (
    role === "admin" ||
    role === "content" ||
    role === "registration" ||
    role === "accommodation" ||
    role === "finance"
  );
}

/** True for console admins and venue staff alike (drives admin shell auth). */
export function isValidStaffRole(
  role: string | undefined | null,
): role is StaffRole {
  return isAdminRole(role) || role === "room_assignment" || role === "checkin";
}

/** Alias used by route guards for the arrival surface. */
export const isStaffRole = isValidStaffRole;

export function canAccessArea(
  role: string | undefined | null,
  area: AdminArea,
): boolean {
  if (!isValidStaffRole(role)) return false;
  return AREA_ROLES[area].includes(role);
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  content: "Content",
  registration: "Registration",
  accommodation: "Accommodation",
  finance: "Finance",
  room_assignment: "Room assignment staff",
  checkin: "Check-in staff",
};

/** Powers granted on the arrival surface, mirroring the server-side checks. */
export const ARRIVAL_ROLES: readonly StaffRole[] = [
  ...ADMIN_ROLES,
  ...VENUE_STAFF_ROLES,
];

/** Desk authority: overrides, corrections, clearing flags, sync conflicts.
 * Room-assignment staff hold it because they run the desk with the
 * accommodation team. */
export const ARRIVAL_APPROVER_ROLES: readonly StaffRole[] = [
  "admin",
  "accommodation",
  "room_assignment",
];
