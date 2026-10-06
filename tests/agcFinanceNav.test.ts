import { expect, test } from "vitest";
import { ADMIN_NAV_GROUPS } from "../src/lib/adminNav";
import { canAccessArea } from "../src/lib/adminRoles";

/** Sidebar scoping for the finance role (read-only financial views only). */

const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

test("accommodations finance table entry is finance-only", () => {
  const entry = items.find(
    (item) => item.href === "/admin/finance/accommodations",
  );
  expect(entry).toBeDefined();
  expect(entry!.label).toBe("Accommodations");
  expect(entry!.visibleTo).toEqual(["finance"]);
});

test("hubs & reps and tours are hidden from the finance sidebar", () => {
  const hubs = items.find((item) => item.href === "/admin/hubs-reps");
  const tours = items.find((item) => item.href === "/admin/tours");
  expect(hubs?.hiddenFrom).toEqual(["finance"]);
  expect(tours?.hiddenFrom).toEqual(["finance"]);
});

test("finance sidebar filter yields overview, registrations, accommodations and audit only", () => {
  const visible = items.filter((item) => {
    if (item.area && !canAccessArea("finance", item.area)) return false;
    if (item.visibleTo && !item.visibleTo.includes("finance")) return false;
    if (item.hiddenFrom?.includes("finance")) return false;
    return true;
  });
  // Overview is area-less (always visible); audit allows finance by design.
  // Hubs & reps, tours and hotels are scoped out — finance is read-only money.
  expect(visible.map((item) => item.href)).toEqual([
    "/admin",
    "/admin/registrations",
    "/admin/finance/accommodations",
    "/admin/audit",
  ]);
});

test("admin still sees the full operations sidebar (behaviour intact)", () => {
  const visible = items.filter((item) => {
    if (item.area && !canAccessArea("admin", item.area)) return false;
    if (item.visibleTo && !item.visibleTo.includes("admin")) return false;
    if (item.hiddenFrom?.includes("admin")) return false;
    return true;
  });
  expect(visible.map((item) => item.href)).toContain("/admin/hubs-reps");
  expect(visible.map((item) => item.href)).toContain("/admin/tours");
  expect(visible.map((item) => item.href)).toContain("/admin/accommodation");
  expect(visible.map((item) => item.href)).not.toContain(
    "/admin/finance/accommodations",
  );
});
