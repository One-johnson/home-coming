import type { StaffRole } from "@/lib/adminRoles";

/**
 * Dedicated sign-in routes per team. /admin is the console's own door (and
 * also the door for venue staff, who land on the arrival desk); every other
 * console team signs in at their own top-level URL. Each route only accepts
 * the roles of that team — an admin account trying /registration is told to
 * use /admin instead, never signed in silently.
 */

export const TEAM_KEYS = [
  "admin",
  "registration",
  "accommodation",
  "finance",
  "content",
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
};

/** The team whose sign-in route a role should use, or null for venue staff. */
export function teamForRole(role: StaffRole | string | null | undefined): TeamKey | null {
  if (role === "admin") return "admin";
  if (role === "registration") return "registration";
  if (role === "accommodation") return "accommodation";
  if (role === "finance") return "finance";
  if (role === "content") return "content";
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
  // Venue staff have no team route: /admin is their door, landing on Arrival.
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
