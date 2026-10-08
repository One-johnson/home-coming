import { describe, expect, it } from "vitest";

import {
  iouReceiptHtml,
  poaStatusMeta,
  type IouReceiptDoc,
} from "@/lib/agcPoa";
import { isRoomableBooking } from "@convex/agcRoomAssignments";

const baseDoc: IouReceiptDoc = {
  kind: "booking",
  referenceNumber: "HC12345",
  hubName: "Accra Hub <Central>",
  region: "ghana",
  repName: "accra_hub",
  currency: "GHS",
  issuedAt: Date.parse("2026-10-01T10:00:00Z"),
  poaStatus: "pending",
  confirmedAt: null,
  totalAmount: 900,
  lines: [
    { description: "Hostel — 6 bed(s)", quantity: 6, unitPrice: 150, amount: 900 },
  ],
};

describe("poaStatusMeta", () => {
  it("labels every lifecycle stage", () => {
    expect(poaStatusMeta("pending").label).toContain("IOU");
    expect(poaStatusMeta("evidence_submitted").label).toContain("Evidence");
    expect(poaStatusMeta("confirmed").label).toContain("confirmed");
  });

  it("falls back for unknown statuses", () => {
    const meta = poaStatusMeta("mystery");
    expect(meta.label).toBe("mystery");
  });
});

describe("iouReceiptHtml", () => {
  it("renders an IOU while unpaid and mentions the total", () => {
    const html = iouReceiptHtml(baseDoc);
    expect(html).toContain("IOU RECEIPT");
    expect(html).toContain("HC12345");
    expect(html).toContain("GHS 900");
    expect(html).toContain("due on arrival");
  });

  it("escapes hub names and renders a paid receipt when confirmed", () => {
    const html = iouReceiptHtml({
      ...baseDoc,
      poaStatus: "confirmed",
      confirmedAt: Date.parse("2026-10-02T09:00:00Z"),
    });
    expect(html).toContain("PAID RECEIPT");
    expect(html).not.toContain("IOU RECEIPT");
    expect(html).toContain("Accra Hub &lt;Central&gt;");
    expect(html).toContain("confirmed by the Homecoming 2026 registration desk");
  });
});

describe("isRoomableBooking", () => {
  it("rooms confirmed bookings and POA bookings still on hold", () => {
    expect(
      isRoomableBooking({
        bookingStatus: "confirmed",
        paymentMode: "offline",
      }),
    ).toBe(true);
    expect(
      isRoomableBooking({
        bookingStatus: "reserved",
        paymentMode: "payment_on_arrival",
        poa: { status: "pending" },
      }),
    ).toBe(true);
  });

  it("excludes deleted, closed, and ordinary unpaid holds", () => {
    expect(
      isRoomableBooking({
        bookingStatus: "reserved",
        paymentMode: "offline",
      }),
    ).toBe(false);
    expect(
      isRoomableBooking({
        deletedAt: 123,
        bookingStatus: "confirmed",
        paymentMode: "offline",
      }),
    ).toBe(false);
    expect(
      isRoomableBooking({
        bookingStatus: "expired",
        paymentMode: "payment_on_arrival",
        poa: { status: "pending" },
      }),
    ).toBe(false);
  });
});
