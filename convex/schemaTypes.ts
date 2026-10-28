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
// Phase 2 — room assignment publication, check-in, keys, offline sync
// ------------------------------------------------------------------

/** One room/apartment's key lifecycle (Phase 2 §15). */
export const agcKeyStatus = v.union(
  v.literal("not_issued"),
  v.literal("issued"),
  v.literal("replaced"),
  v.literal("returned"),
);

/** Key/wristband state recorded at checkout (Phase 2 §20). */
export const agcKeyReturnStatus = v.union(
  v.literal("returned"),
  v.literal("not_returned"),
  v.literal("not_applicable"),
);

/** Operational actions an offline station can queue (Phase 2 §19). */
export const agcOfflineAction = v.union(
  v.literal("check_in"),
  v.literal("check_out"),
  v.literal("issue_key"),
  v.literal("room_change"),
);

/** Offline transaction lifecycle (Phase 2 §19). */
export const agcOfflineSyncStatus = v.union(
  v.literal("pending"),
  v.literal("synced"),
  v.literal("conflict"),
  v.literal("rejected"),
);

/** Payment-override authorization captured at check-in (Phase 2 §18). */
export const agcPaymentOverride = v.object({
  authorizedBy: v.string(),
  reason: v.string(),
  authorizedAt: v.number(),
});

/**
 * Maintenance problems raised against a physical room — a broken toilet, no
 * running water, a dead socket. Kept as their own records so a room can carry
 * several at once and each keeps who raised it and when it was fixed.
 */
export const agcRoomIssueCategory = v.union(
  v.literal("toilet"),
  v.literal("water"),
  v.literal("electrical"),
  v.literal("door_lock"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const agcRoomIssueStatus = v.union(
  v.literal("open"),
  v.literal("fixed"),
);

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
export type AgcKeyStatus = Infer<typeof agcKeyStatus>;
export type AgcKeyReturnStatus = Infer<typeof agcKeyReturnStatus>;
export type AgcOfflineAction = Infer<typeof agcOfflineAction>;
export type AgcOfflineSyncStatus = Infer<typeof agcOfflineSyncStatus>;
export type AgcPaymentOverride = Infer<typeof agcPaymentOverride>;
export type AgcRoomIssueCategory = Infer<typeof agcRoomIssueCategory>;
export type AgcRoomIssueStatus = Infer<typeof agcRoomIssueStatus>;
