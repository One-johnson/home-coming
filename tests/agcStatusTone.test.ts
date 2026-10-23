import { describe, expect, test } from "vitest";
import {
  buildingChipClass,
  buildingChipIndex,
  checkInState,
  deskRowState,
  occupancyTone,
  paymentState,
} from "@/lib/agcStatusTone";

describe("paymentState", () => {
  test("confirmed POA and confirmed payment both read as done", () => {
    expect(paymentState("pending", "confirmed")).toEqual({
      label: "POA paid",
      tone: "done",
    });
    expect(paymentState("confirmed", null).tone).toBe("done");
    expect(paymentState("confirmed", null).label).toBe("Paid");
  });

  test("evidence submitted is informational, pending payment is blocked", () => {
    expect(paymentState("pending", "evidence_submitted")).toEqual({
      label: "POA evidence — review",
      tone: "info",
      detail: "Proof uploaded; confirm it before check-in.",
    });
    expect(paymentState("pending", "pending").tone).toBe("blocked");
    expect(paymentState("pending", "poa_pending").label).toBe("POA pending");
  });

  test("no payment due is waiting, never amber", () => {
    expect(paymentState("not_required", null)).toEqual({
      label: "No payment due",
      tone: "waiting",
    });
  });

  test("raw enum text is humanised rather than printed at the desk", () => {
    const state = paymentState("part_paid", null);
    expect(state.label).toBe("Payment part paid");
    expect(state.label).not.toContain("_");
    expect(state.tone).toBe("blocked");
  });
});

describe("deskRowState", () => {
  const base = {
    checkInStatus: "not_arrived" as const,
    assignmentStatus: "assigned" as const,
    paymentStatus: "confirmed",
    poaStatus: null,
  };

  test("assigned and paid is the only ready state", () => {
    const state = deskRowState(base);
    expect(state).toEqual({ tone: "done", label: "Ready — check in", ready: true });
  });

  test("no room blocks the row with a referral", () => {
    const state = deskRowState({ ...base, assignmentStatus: "unassigned" });
    expect(state.tone).toBe("blocked");
    expect(state.ready).toBe(false);
    expect(state.label).toContain("refer");
  });

  test("unconfirmed payment blocks even with a room", () => {
    expect(deskRowState({ ...base, paymentStatus: "pending" }).label).toBe(
      "Payment first",
    );
  });

  test("checked-in and checked-out rows need no action", () => {
    expect(deskRowState({ ...base, checkInStatus: "checked_in" })).toEqual({
      tone: "info",
      label: "Checked in",
      ready: false,
    });
    expect(deskRowState({ ...base, checkInStatus: "checked_out" })).toEqual({
      tone: "waiting",
      label: "Checked out",
      ready: false,
    });
  });

  test("a checked-in row is never offered for check-in again", () => {
    expect(deskRowState({ ...base, checkInStatus: "checked_in" }).ready).toBe(false);
  });
});

describe("occupancyTone", () => {
  test("green has room, amber is filling, rose is full", () => {
    expect(occupancyTone(0)).toBe("done");
    expect(occupancyTone(69)).toBe("done");
    expect(occupancyTone(70)).toBe("blocked");
    expect(occupancyTone(94)).toBe("blocked");
    expect(occupancyTone(95)).toBe("refused");
    expect(occupancyTone(100)).toBe("refused");
  });
});

describe("checkInState", () => {
  test("maps the three statuses to labels and tones", () => {
    expect(checkInState("checked_in")).toEqual({ label: "Checked in", tone: "done" });
    expect(checkInState("checked_out")).toEqual({
      label: "Checked out",
      tone: "waiting",
    });
    expect(checkInState("not_arrived").tone).toBe("waiting");
  });
});

describe("building chips", () => {
  test("a building always gets the same chip", () => {
    const first = buildingChipIndex("Blocks 1–4");
    const second = buildingChipIndex("Blocks 1–4");
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(6);
  });

  test("different blocks do not all collapse to one colour", () => {
    const indexes = new Set(
      ["Block 1", "Block 2", "Block 3", "Block 4", "Block 5", "Central"].map(
        buildingChipIndex,
      ),
    );
    expect(indexes.size).toBeGreaterThan(1);
  });

  test("no building means no chip", () => {
    expect(buildingChipClass(null)).toBe("");
    expect(buildingChipClass("")).toBe("");
    expect(buildingChipClass("Block 7")).toContain("border-");
  });
});
