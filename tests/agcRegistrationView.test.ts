import { describe, expect, test } from "vitest";
import {
  matchesRegistrationFilter,
  registrationStage,
} from "../src/lib/agcRegistrationView";

/** Pins the registration status-timeline and filter-chip rules. */

describe("registrationStage", () => {
  test("awaiting payment sits at the submitted step", () => {
    const stage = registrationStage("awaiting_payment");
    expect(stage.current).toBe(0);
    expect(stage.rejected).toBe(false);
  });

  test("receipts in review reach step two", () => {
    expect(registrationStage("pending_verification").current).toBe(1);
    expect(registrationStage("correction_requested").current).toBe(1);
    expect(registrationStage("pending_verification").rejected).toBe(false);
  });

  test("rejected marks the review step as failed", () => {
    const stage = registrationStage("rejected");
    expect(stage.current).toBe(1);
    expect(stage.rejected).toBe(true);
  });

  test("confirmed reaches the final step", () => {
    const stage = registrationStage("confirmed");
    expect(stage.current).toBe(2);
    expect(stage.rejected).toBe(false);
    expect(stage.steps[2]).toBe("Confirmed");
  });
});

describe("matchesRegistrationFilter", () => {
  test("each chip matches exactly its status group", () => {
    expect(matchesRegistrationFilter("awaiting", "awaiting_payment")).toBe(true);
    expect(matchesRegistrationFilter("awaiting", "confirmed")).toBe(false);
    expect(matchesRegistrationFilter("review", "pending_verification")).toBe(true);
    expect(matchesRegistrationFilter("review", "correction_requested")).toBe(true);
    expect(matchesRegistrationFilter("review", "confirmed")).toBe(false);
    expect(matchesRegistrationFilter("confirmed", "confirmed")).toBe(true);
    expect(matchesRegistrationFilter("rejected", "rejected")).toBe(true);
    expect(matchesRegistrationFilter("rejected", "confirmed")).toBe(false);
  });

  test("all matches everything", () => {
    for (const status of ["awaiting_payment", "pending_verification", "confirmed", "rejected"]) {
      expect(matchesRegistrationFilter("all", status)).toBe(true);
    }
  });
});
