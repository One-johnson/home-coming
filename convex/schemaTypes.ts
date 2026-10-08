import { defineSchema } from "convex/server";
import { v, type Infer } from "convex/values";

/**
 * Shared AGC validators + inferred types. Lives outside schema.ts so lib
 * modules can import them without circular imports (schema.ts re-exports).
 * The real tables are defined in schema.ts.
 */
export default defineSchema({});

// ------------------------------------------------------------------
// Validators
// ------------------------------------------------------------------

export const agcRegion = v.union(
  v.literal("ghana"),
  v.literal("west_africa"),
  v.literal("rest_of_africa"),
  v.literal("north_america"),
  v.literal("england"),
  v.literal("switzerland"),
  v.literal("rest_of_europe"),
  v.literal("rest_of_world"),
);

export const agcAccommodationType = v.union(
  v.literal("dormitory"),
  v.literal("hostel"),
  v.literal("wise_serpents"),
  v.literal("good_general"),
  v.literal("ebpv"),
);

export const agcInventoryScope = v.union(
  v.literal("africa"),
  v.literal("rest_of_world"),
  v.literal("global"),
);

export const agcPaymentMode = v.union(
  v.literal("offline"),
  v.literal("stripe"),
  v.literal("paypal"),
  v.literal("payment_on_arrival"),
);

export const agcPaymentStatus = v.union(
  v.literal("awaiting_payment"),
  v.literal("pending_verification"),
  v.literal("correction_requested"),
  v.literal("rejected"),
  v.literal("confirmed"),
);

export const agcBookingStatus = v.union(
  v.literal("reserved"),
  v.literal("pending_verification"),
  v.literal("correction_requested"),
  v.literal("confirmed"),
  v.literal("expired"),
  v.literal("cancelled"),
);

export const agcGender = v.union(v.literal("male"), v.literal("female"));

export const agcOfflinePayment = v.object({
  amountPaid: v.number(),
  referenceNumber: v.string(),
  paymentDate: v.string(),
  method: v.union(v.literal("bank_transfer"), v.literal("momo")),    receiptStorageId: v.optional(v.id("_storage")),
    receiptFileName: v.optional(v.string()),
    receiptContentType: v.optional(v.string()),
    /** Server clock at submission; clients no longer send it. */
    submittedAt: v.optional(v.number()),
  // Phase 1: manual review only — AI extraction is stubbed for later.
  aiMatch: v.optional(
    v.union(
      v.literal("possible_match"),
      v.literal("amount_mismatch"),
      v.literal("unable_to_read"),
      v.literal("manual_review"),
    ),
  ),
});

// ------------------------------------------------------------------
// POA (payment on arrival) — per-record lifecycle. The IOU receipt itself is
// never stored in the database: it is generated on demand from the record +
// config, and only becomes a stored "paid receipt" fact via `status: "confirmed"`.
// ------------------------------------------------------------------

export const agcPoaStatus = v.union(
  v.literal("pending"),
  v.literal("evidence_submitted"),
  v.literal("confirmed"),
);

export const agcPoaRecord = v.object({
  status: agcPoaStatus,
  /** Rep's note when uploading payment evidence. */
  note: v.optional(v.string()),
  evidenceStorageId: v.optional(v.id("_storage")),
  evidenceFileName: v.optional(v.string()),
  evidenceContentType: v.optional(v.string()),
  /** Server clock at evidence submission. */
  submittedAt: v.optional(v.number()),
  /** Set only when an admin/finance confirms the payment. */
  confirmedAt: v.optional(v.number()),
  confirmedBy: v.optional(v.string()),
});

export const agcBishopReview = v.object({
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("difference_requested"),
    v.literal("cancelled"),
  ),
  requestedDifference: v.optional(v.number()),
  currency: v.optional(v.string()),
  note: v.optional(v.string()),
});

// ------------------------------------------------------------------
// Inferred types
// ------------------------------------------------------------------

export type AgcRegion = Infer<typeof agcRegion>;
export type AgcAccommodationType = Infer<typeof agcAccommodationType>;
export type AgcInventoryScope = Infer<typeof agcInventoryScope>;
export type AgcPaymentMode = Infer<typeof agcPaymentMode>;
export type AgcPaymentStatus = Infer<typeof agcPaymentStatus>;
export type AgcBookingStatus = Infer<typeof agcBookingStatus>;
export type AgcGender = Infer<typeof agcGender>;
export type AgcOfflinePayment = Infer<typeof agcOfflinePayment>;
export type AgcBishopReview = Infer<typeof agcBishopReview>;
export type AgcPoaStatus = Infer<typeof agcPoaStatus>;
export type AgcPoaRecord = Infer<typeof agcPoaRecord>;
