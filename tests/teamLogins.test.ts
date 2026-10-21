import { describe, expect, test } from "vitest";
import {
  TEAM_KEYS,
  TEAM_LOGINS,
  TEAM_SIGN_IN_PATHS,
  canSignInToTeam,
  otherTeamLogins,
  signInPathForRole,
  teamForRole,
} from "../src/lib/teamLogins";

/**
 * Each console team has its own dedicated sign-in route: /admin for admins,
 * /registration, /accommodation, /finance and /content for the rest. A team
 * route must only accept its own role, and every route must be distinct.
 */

describe("team sign-in routes", () => {
  test("every team has the expected dedicated URL", () => {
    expect(TEAM_LOGINS.admin.signInPath).toBe("/admin");
    expect(TEAM_LOGINS.registration.signInPath).toBe("/registration");
    expect(TEAM_LOGINS.accommodation.signInPath).toBe("/accommodation");
    expect(TEAM_LOGINS.finance.signInPath).toBe("/finance");
    expect(TEAM_LOGINS.content.signInPath).toBe("/content");
    expect(TEAM_LOGINS.room_assignment.signInPath).toBe("/room-assignment");
    expect(TEAM_LOGINS.checkin.signInPath).toBe("/check-in");
  });

  test("sign-in URLs are unique and homes live inside the console", () => {
    const paths = TEAM_KEYS.map((key) => TEAM_LOGINS[key].signInPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const key of TEAM_KEYS) {
      expect(TEAM_LOGINS[key].homePath.startsWith("/admin")).toBe(true);
    }
    // Both venue staff teams land on the arrival desk.
    expect(TEAM_LOGINS.checkin.homePath).toBe("/admin/arrival");
    expect(TEAM_LOGINS.room_assignment.homePath).toBe("/admin/arrival");
  });

  test("a team route only accepts that team's role", () => {
    expect(canSignInToTeam("admin", "admin")).toBe(true);
    expect(canSignInToTeam("registration", "registration")).toBe(true);
    expect(canSignInToTeam("accommodation", "accommodation")).toBe(true);
    expect(canSignInToTeam("finance", "finance")).toBe(true);
    expect(canSignInToTeam("content", "content")).toBe(true);
    expect(canSignInToTeam("room_assignment", "room_assignment")).toBe(true);
    expect(canSignInToTeam("checkin", "checkin")).toBe(true);

    // Cross-team attempts are rejected (they are told where to go instead).
    expect(canSignInToTeam("admin", "registration")).toBe(false);
    expect(canSignInToTeam("registration", "admin")).toBe(false);
    expect(canSignInToTeam("finance", "accommodation")).toBe(false);
    // Venue staff have their own doors and cannot use the other teams'.
    expect(canSignInToTeam("checkin", "admin")).toBe(false);
    expect(canSignInToTeam("checkin", "room_assignment")).toBe(false);
    expect(canSignInToTeam("room_assignment", "accommodation")).toBe(false);
    expect(canSignInToTeam("admin", "checkin")).toBe(false);
    expect(canSignInToTeam(null, "admin")).toBe(false);
  });

  test("roles map back to their own sign-in route, venue staff included", () => {
    expect(teamForRole("admin")).toBe("admin");
    expect(teamForRole("registration")).toBe("registration");
    expect(teamForRole("accommodation")).toBe("accommodation");
    expect(teamForRole("finance")).toBe("finance");
    expect(teamForRole("content")).toBe("content");
    expect(teamForRole("checkin")).toBe("checkin");
    expect(teamForRole("room_assignment")).toBe("room_assignment");
    expect(teamForRole("something_else")).toBeNull();

    expect(signInPathForRole("finance")).toBe("/finance");
    expect(signInPathForRole("checkin")).toBe("/check-in");
    expect(signInPathForRole("room_assignment")).toBe("/room-assignment");
  });

  test("public chrome is suppressed only for the top-level team routes", () => {
    expect(TEAM_SIGN_IN_PATHS).toContain("/registration");
    expect(TEAM_SIGN_IN_PATHS).toContain("/accommodation");
    expect(TEAM_SIGN_IN_PATHS).toContain("/finance");
    expect(TEAM_SIGN_IN_PATHS).toContain("/content");
    expect(TEAM_SIGN_IN_PATHS).toContain("/room-assignment");
    expect(TEAM_SIGN_IN_PATHS).toContain("/check-in");
    expect(TEAM_SIGN_IN_PATHS).not.toContain("/admin");
  });

  test("the footer cross-links list every other team, never the current one", () => {
    const others = otherTeamLogins("registration");
    expect(others.map((team) => team.key)).not.toContain("registration");
    expect(others).toHaveLength(TEAM_KEYS.length - 1);
    expect(others.map((team) => team.signInPath)).toContain("/admin");
  });
});
