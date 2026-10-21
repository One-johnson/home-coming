import type { StaffRole } from "@/lib/adminRoles";

/**
 * Dedicated sign-in routes per team: /admin, /registration, /accommodation,
 * /finance, /content, plus /room-assignment and /check-in for the two venue
 * staff roles (both land on the arrival desk). Each route only accepts the
 * roles of that team — an admin account trying /registration is told to use
 * /admin instead, never signed in silently. /admin additionally accepts
 * venue staff, so existing staff bookmarks keep working.
 */

export const TEAM_KEYS = [
  "admin",
  "registration",
  "accommodation",
  "finance",
  "content",
  "room_assignment",
  "checkin",
] as const;

export type TeamKey = (typeof TEAM_KEYS)[number];

export type TeamLogin = {
  key: TeamKey;
  label: string;
  /** Public sign-in route for this team. */
  signInPath: string;
  /** Where this team lands after signing in. */
  homePath: string;
  /** Roles allowed to sign in at this route. */
  roles: readonly StaffRole[];
  description: string;
};

export const TEAM_LOGINS: Record<TeamKey, TeamLogin> = {
  admin: {
    key: "admin",
    label: "Admin",
    signInPath: "/admin",
    homePath: "/admin",
    roles: ["admin"],
    description: "Full console access: registrations, accommodation, finance, content and settings.",
  },
  registration: {
    key: "registration",
    label: "Registration",
    homePath: "/admin/registrations",
    signInPath: "/registration",
    roles: ["registration"],
    description: "Review hub registrations, offline payments, hubs & reps and tours.",
  },
  accommodation: {
    key: "accommodation",
    label: "Accommodation",
    homePath: "/admin/accommodation",
    signInPath: "/accommodation",
    roles: ["accommodation"],
    description: "Bookings review, capacity pools, room inventory and arrival-desk management.",
  },
  finance: {
    key: "finance",
    label: "Finance",
    homePath: "/admin/finance/accommodations",
    signInPath: "/finance",
    roles: ["finance"],
    description: "Registration and accommodation money, POA verification, exports and audit.",
  },
  content: {
    key: "content",
    label: "Content",
    homePath: "/admin/content",
    signInPath: "/content",
    roles: ["content"],
    description: "FAQs, announcements, hero slides, videos and galleries.",
  },
  room_assignment: {
    key: "room_assignment",
    label: "Room assignment",
    homePath: "/admin/arrival",
    signInPath: "/room-assignment",
    roles: ["room_assignment"],
    description:
      "Venue staff: rooms and assignments, room changes, check-in/out and keys.",
  },
  checkin: {
    key: "checkin",
    label: "Check-in",
    homePath: "/admin/arrival",
    signInPath: "/check-in",
    roles: ["checkin"],
    description:
      "Venue staff: arrival search, check-in/out, keys and status views only.",
  },
};

/** The team whose sign-in route a role should use, or null if unknown. */
export function teamForRole(role: StaffRole | string | null | undefined): TeamKey | null {
  if (role === "admin") return "admin";
  if (role === "registration") return "registration";
  if (role === "accommodation") return "accommodation";
  if (role === "finance") return "finance";
  if (role === "content") return "content";
  if (role === "room_assignment") return "room_assignment";
  if (role === "checkin") return "checkin";
  return null;
}

/** Whether a role may sign in at the given team's route. */
export function canSignInToTeam(
  role: StaffRole | string | null | undefined,
  team: TeamKey,
): boolean {
  if (!role) return false;
  return (TEAM_LOGINS[team].roles as readonly string[]).includes(role);
}

/** The route a signed-in role should be sent to when rejected at `team`. */
export function signInPathForRole(role: StaffRole | string | null | undefined): string {
  const team = teamForRole(role);
  // Unknown roles are pointed at the general console door, which explains
  // that no staff role is assigned.
  return team ? TEAM_LOGINS[team].signInPath : "/admin";
}

/** Top-level team sign-in routes (used to suppress the public site chrome). */
export const TEAM_SIGN_IN_PATHS: readonly string[] = TEAM_KEYS.map(
  (key) => TEAM_LOGINS[key].signInPath,
).filter((path) => !path.startsWith("/admin"));

/** All team routes except `current`, for the "other team" footer links. */
export function otherTeamLogins(current: TeamKey): TeamLogin[] {
  return TEAM_KEYS.filter((key) => key !== current).map((key) => TEAM_LOGINS[key]);
}
