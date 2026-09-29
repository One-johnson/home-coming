import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import {
  cleanErrorMessage,
  friendlyError,
  isSessionExpired,
} from "@/lib/friendlyError";

describe("cleanErrorMessage", () => {
  it("strips the current Convex request-id format", () => {
    const raw =
      "[Request ID: 96a6d283e177e540] Server Error\nUncaught Error: Only unpaid reservations can be cancelled\nCalled by client";
    expect(cleanErrorMessage(raw)).toBe(
      "Only unpaid reservations can be cancelled",
    );
  });

  it("strips the old CONVEX prefix format", () => {
    const raw =
      "[CONVEX A(agcAuth:repLogin)] Server Error\nUncaught Error: Invalid username or password";
    expect(cleanErrorMessage(raw)).toBe("Invalid username or password");
  });

  it("unwraps ConvexError instances carrying a message", () => {
    expect(
      cleanErrorMessage(new ConvexError({ message: "Quantity must be positive" })),
    ).toBe("Quantity must be positive");
    expect(cleanErrorMessage(new ConvexError("Deadline passed"))).toBe(
      "Deadline passed",
    );
  });

  it("hides raw technical errors behind a fallback", () => {
    expect(
      cleanErrorMessage(
        "[Request ID: abc] Server Error\nUncaught TypeError: Cannot read properties of undefined (reading 'total')",
      ),
    ).toBe("Something went wrong. Please try again.");
  });

  it("falls back for non-error values", () => {
    expect(cleanErrorMessage(undefined)).toBe(
      "Something went wrong. Please try again.",
    );
    expect(cleanErrorMessage("")).toBe("Something went wrong. Please try again.");
  });
});

describe("friendlyError", () => {
  it("maps the deadline message with friendly copy", () => {
    const result = friendlyError(
      "[Request ID: x] Server Error\nUncaught Error: The registration deadline has passed. Contact the registration desk for assistance.\nCalled by client",
    );
    expect(result.title).toBe("The deadline has passed");
  });

  it("maps the locked-booking message", () => {
    const result = friendlyError(
      "Only reservations that are still on hold can be edited — contact the accommodation desk for confirmed bookings.",
    );
    expect(result.title).toBe("This booking can't be changed anymore");
  });

  it("maps unauthorized to a session-expired prompt", () => {
    const result = friendlyError("Unauthorized");
    expect(result.title).toBe("Your session has expired");
  });

  it("passes unknown intentional messages through cleaned", () => {
    const result = friendlyError(
      "[Request ID: y] Server Error\nUncaught Error: Quantity must be a whole number of at least 1\nCalled by client",
    );
    expect(result.title).toBe("Quantity must be a whole number of at least 1");
  });
});

describe("isSessionExpired", () => {
  it("detects Unauthorized across formats", () => {
    expect(isSessionExpired("Unauthorized")).toBe(true);
    expect(
      isSessionExpired(
        "[Request ID: z] Server Error\nUncaught Error: Unauthorized\nCalled by client",
      ),
    ).toBe(true);
    expect(isSessionExpired("Quantity must be positive")).toBe(false);
  });
});
