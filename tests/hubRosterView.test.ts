import { describe, expect, test } from "vitest";
import {
  hubAvatarClass,
  hubInitials,
  hubMatchesSearch,
  hubRosterSummary,
  matchesHubFilter,
  quietLabel,
  quietTone,
  sortHubRows,
} from "../src/lib/hubRosterView";
import type { HubRosterRow } from "../src/lib/hubRosterView";

/** Pins the Hubs & Representatives page filter/sort/avatar rules. */

const row = (overrides: Partial<HubRosterRow>): HubRosterRow => ({
  _id: "h1",
  hubName: "Ashanti Mampong",
  region: "ghana",
  active: true,
  rep: { _id: "r1", username: "ashanti_mampong",
    email: "rep@example.com",
    status: "active",
    profileComplete: true,
  },
  registrations: { total: 2, confirmed: 1, pending: 1, delegates: 5, lastActivityAt: 1_000 },
  bookings: { total: 1, confirmed: 1, pending: 0, lastActivityAt: 1_000 },
  needsAttention: false,
  inactiveDays: 0,
  ...overrides,
});

describe("hubInitials", () => {
  test("first letters of first and last words", () => {
    expect(hubInitials("Ashanti Mampong")).toBe("AM");
    expect(hubInitials("Adenta")).toBe("AD");
    expect(hubInitials("  ")).toBe("?");
  });
});

describe("hubAvatarClass", () => {
  test("stable per hub", () => {
    expect(hubAvatarClass("Adenta")).toBe(hubAvatarClass("Adenta"));
  });
});

describe("quietTone / quietLabel", () => {
  test("traffic-light thresholds", () => {
    expect(quietTone(0, true)).toBe("fresh");
    expect(quietTone(3, true)).toBe("cooling");
    expect(quietTone(7, true)).toBe("quiet");
    expect(quietTone(9, false)).toBe("none");
  });

  test("labels", () => {
    expect(quietLabel(0, true)).toBe("Active today");
    expect(quietLabel(1, true)).toBe("1 day");
    expect(quietLabel(9, true)).toBe("9 days");
    expect(quietLabel(9, false)).toBe("No activity");
  });
});

describe("matchesHubFilter", () => {
  test("each chip matches its group", () => {
    expect(matchesHubFilter("attention", row({ needsAttention: true }))).toBe(true);
    expect(matchesHubFilter("attention", row({}))).toBe(false);
    expect(matchesHubFilter("pending_setup", row({ rep: { _id: "r", username: "u", email: null, status: "pending_setup", profileComplete: false } }))).toBe(true);
    expect(matchesHubFilter("active", row({}))).toBe(true);
    expect(matchesHubFilter("disabled", row({ rep: { _id: "r", username: "u", email: null, status: "disabled", profileComplete: true } }))).toBe(true);
    expect(matchesHubFilter("no_rep", row({ rep: null }))).toBe(true);
    expect(matchesHubFilter("no_rep", row({}))).toBe(false);
    expect(matchesHubFilter("all", row({}))).toBe(true);
  });
});

describe("sortHubRows", () => {
  test("delegates desc with name tiebreak", () => {
    const rows = [
      row({ _id: "a", hubName: "B", registrations: { total: 1, confirmed: 0, pending: 0, delegates: 3, lastActivityAt: 1 } }),
      row({ _id: "b", hubName: "A", registrations: { total: 1, confirmed: 0, pending: 0, delegates: 9, lastActivityAt: 1 } }),
      row({ _id: "c", hubName: "C", registrations: { total: 1, confirmed: 0, pending: 0, delegates: 9, lastActivityAt: 1 } }),
    ];
    expect(sortHubRows("delegates", rows).map((r) => r.hubName)).toEqual(["A", "C", "B"]);
  });

  test("quiet sorts no-activity hubs last-quiet-first", () => {
    const rows = [
      row({ _id: "a", hubName: "Fresh", inactiveDays: 0 }),
      row({ _id: "b", hubName: "Old", inactiveDays: 12 }),
      row({ _id: "c", hubName: "None", registrations: { total: 0, confirmed: 0, pending: 0, delegates: 0, lastActivityAt: 0 }, bookings: { total: 0, confirmed: 0, pending: 0, lastActivityAt: 0 }, inactiveDays: 0 }),
    ];
    const out = sortHubRows("quiet", rows).map((r) => r.hubName);
    expect(out[0]).toBe("None");
    expect(out[out.length - 1]).toBe("Fresh");
  });
});

describe("hubMatchesSearch", () => {
  test("matches hub, username, email", () => {
    expect(hubMatchesSearch(row({}), "ashanti")).toBe(true);
    expect(hubMatchesSearch(row({}), "adenta")).toBe(false);
    expect(hubMatchesSearch(row({}), "rep@example")).toBe(true);
    expect(hubMatchesSearch(row({}), "")).toBe(true);
  });
});

describe("hubRosterSummary", () => {
  test("totals across rows", () => {
    const summary = hubRosterSummary([
      row({}),
      row({ _id: "z", rep: null, needsAttention: true, registrations: { total: 0, confirmed: 0, pending: 0, delegates: 0, lastActivityAt: 0 } }),
    ]);
    expect(summary.hubs).toBe(2);
    expect(summary.activeReps).toBe(1);
    expect(summary.delegates).toBe(5);
    expect(summary.attention).toBe(1);
  });
});
