import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

/**
 * agcRoomAssignments.by_guest is history, not a one-row-per-guest lookup: a move
 * or a removal closes the row instead of deleting it, so one delegate can own
 * several rows. Convex's `.unique()` throws as soon as a query returns a second
 * document, and because that throw is not a ConvexError a deployed backend
 * redacts it to "something went wrong" — which is how a delegate who was moved
 * and then removed stops being roomable anywhere, beds free or not.
 *
 * convex-test does not enforce `.unique()`, so this guard reads the source.
 */
test("assignment history is never read with .unique()", () => {
  for (const file of ["convex/agcRoomAssignments.ts", "convex/agcCheckin.ts"]) {
    const source = readFileSync(file, "utf8");
    const offenders = [
      ...source.matchAll(/query\("agcRoomAssignments"\)[\s\S]{0,200}?\.unique\(\)/g),
    ].map((match) => match[0].replace(/\s+/g, " "));
    expect(offenders, file).toEqual([]);
  }
});
