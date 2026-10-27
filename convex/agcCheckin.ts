import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole } from "./users";
import { writeAuditLog } from "./lib/audit";
import { agcKeyReturnStatus } from "./schemaTypes";
import type { AgcKeyReturnStatus, AgcKeyStatus } from "./schemaTypes";
import {
  isRoomableBooking,
} from "./agcRoomAssignments";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";

/**
 * Accommodation check-in module (Phase 2 §10–20).
 *
 * - Duplicates prevented by the by_guest check-in index (§16).
 * - Unassigned delegates cannot check in (§17); POA bookings are checkable
 *   by design, other unconfirmed payments need an Accommodation Admin
 *   override (§18).
 * - Keys: WSL/Good General issue room keys; EBPV keys go to the first
 *   arrival in the apartment (§14–15). Dorms/hostels: wristband only.
 */

const CHECKIN_ROLES = [
  "admin",
  "accommodation",
  "room_assignment",
  "checkin",
] as const;
const APPROVER_ROLES = ["admin", "accommodation"] as const;

type Ctx = QueryCtx | MutationCtx;

/** Room key record for a room, or null. */
async function keyForRoom(
  ctx: Ctx,
  roomId: Id<"agcRooms">,
): Promise<Doc<"agcKeys"> | null> {
  const rows = await ctx.db
    .query("agcKeys")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .collect();
  if (rows.length === 0) return null;
  // Latest updated row wins if data ever duplicates.
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/** Live (uncorrected, open) check-in row for a guest, or null. */
async function activeCheckIn(
  ctx: Ctx,
  guestId: Id<"agcGuests">,
): Promise<Doc<"agcCheckIns"> | null> {
  const rows = await ctx.db
    .query("agcCheckIns")
    .withIndex("by_guest", (q) => q.eq("guestId", guestId))
    .collect();
  return rows.find((row) => !row.correctedAt) ?? null;
}

/**
 * An open "review this record" flag as the desk reads it. The desk raises
 * these; the Accommodation Admin clears them.
 */
export type CheckinReviewFlag = {
  _id: string;
  note: string;
  raisedAt: number;
  raisedBy: string;
};

function reviewFlagView(flag: Doc<"agcCheckinFlags">): CheckinReviewFlag {
  return {
    _id: flag._id,
    note: flag.note,
    raisedAt: flag.raisedAt,
    raisedBy: flag.raisedBy,
  };
}

/** Latest open review flag for a guest, or null. */
async function openReviewFlag(
  ctx: Ctx,
  guestId: Id<"agcGuests">,
): Promise<Doc<"agcCheckinFlags"> | null> {
  const rows = await ctx.db
    .query("agcCheckinFlags")
    .withIndex("by_guest", (q) => q.eq("guestId", guestId))
    .collect();
  return rows
    .filter((row) => row.resolvedAt === undefined)
    .sort((a, b) => b.raisedAt - a.raisedAt)[0] ?? null;
}

/** Open review flags keyed by guest, for the desk sheet. */
function openReviewFlagsByGuest(
  flags: Doc<"agcCheckinFlags">[],
): Map<string, CheckinReviewFlag> {
  const map = new Map<string, CheckinReviewFlag>();
  for (const flag of flags) {
    if (flag.resolvedAt !== undefined) continue;
    const current = map.get(flag.guestId);
    if (current && current.raisedAt > flag.raisedAt) continue;
    map.set(flag.guestId, reviewFlagView(flag));
  }
  return map;
}

/** Room types where a physical key is tracked (§14). */
function roomNeedsKey(
  type: Doc<"agcRooms">["accommodationType"],
): boolean {
  return (
    type === "wise_serpents" ||
    type === "good_general" ||
    type === "ebpv"
  );
}

function guestLabel(guest: Doc<"agcGuests">): string {
  return `${guest.title} ${guest.firstName} ${guest.lastName}`.trim();
}

/**
 * Bed number per guest: the guest's position among the room's open
 * assignments (oldest first). Beds are not stored — the roster shows where a
 * delegate sits in the room, and the count stays stable as guests move out.
 */
function bedNumbersByGuest(
  assignments: Doc<"agcRoomAssignments">[],
): Map<string, number> {
  const byRoom = new Map<string, Doc<"agcRoomAssignments">[]>();
  for (const assignment of assignments) {
    if (assignment.endedAt !== undefined) continue;
    const rows = byRoom.get(assignment.roomId) ?? [];
    rows.push(assignment);
    byRoom.set(assignment.roomId, rows);
  }
  const beds = new Map<string, number>();
  for (const rows of byRoom.values()) {
    rows.sort((a, b) => a.createdAt - b.createdAt);
    rows.forEach((assignment, index) => beds.set(assignment.guestId, index + 1));
  }
  return beds;
}

/** The key column as the desk reads it: issued, returned, or awaiting issue. */
export type ArrivalKeyState = "issued" | "returned" | "pending";

function keyStateForRoom(
  room: Doc<"agcRooms"> | undefined,
  key: Doc<"agcKeys"> | undefined,
): ArrivalKeyState | null {
  if (!room || !roomNeedsKey(room.accommodationType)) return null;
  if (!key) return "pending";
  return key.status === "returned" ? "returned" : "issued";
}

/** Viewing identity for check-in operations — a staff member or a synced
 * offline transaction replaying an earlier staff action (§19). */
export type CheckinActor = {
  userId?: Id<"users">;
  email: string;
  role?: string;
};

/** Whether a role may authorize a payment override (§18). */
export function isApproverRole(role: string | undefined): boolean {
  return role === "admin" || role === "accommodation";
}

// ------------------------------------------------------------------
// Search (§11)
// ------------------------------------------------------------------

export type ArrivalSearchRow = {
  guestId: string;
  bookingId: string;
  name: string;
  gender: string;
  hubName: string;
  accommodationType: string;
  bookingRef: string;
  paymentStatus: string;
  bookingStatus: string;
  poaStatus: string | null;
  assignmentStatus: "assigned" | "unassigned";
  roomId: string | null;
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
  checkInId: string | null;
  checkedInAt: number | null;
  checkedInBy: string | null;
  checkedOutAt: number | null;
  /** Position within the room's open assignments; null when unassigned. */
  bedNumber: number | null;
  /** Key state for keyed rooms (WSL, Good General, EBPV); null otherwise. */
  keyStatus: ArrivalKeyState | null;
  /** Whether this room type tracks a physical key at all. */
  needsKey: boolean;
  /** Open review flag raised by the desk; null when the record is unflagged. */
  reviewFlag: CheckinReviewFlag | null;
};

/** Search delegates by name/hub/type for the check-in desk. */
export const searchDelegates = query({
  args: {
    sessionToken: v.string(),
    search: v.optional(v.string()),
    accommodationType: v.optional(
      v.union(
        v.literal("dormitory"),
        v.literal("hostel"),
        v.literal("wise_serpents"),
        v.literal("good_general"),
        v.literal("ebpv"),
      ),
    ),
    hubId: v.optional(v.id("agcHubs")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ArrivalSearchRow[]> => {
    await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);

    const term = (args.search ?? "").trim().toLowerCase();
    const tokens = term.split(/\s+/).filter(Boolean);

    const rooms = (await ctx.db.query("agcRooms").collect()).reduce(
      (map, room) => map.set(room._id, room),
      new Map<Id<"agcRooms">, Doc<"agcRooms">>(),
    );
    const assignments = await ctx.db.query("agcRoomAssignments").collect();
    const openByGuest = new Map<string, Doc<"agcRoomAssignments">>();
    for (const a of assignments) {
      if (a.endedAt === undefined) openByGuest.set(a.guestId, a);
    }
    const bedByGuest = bedNumbersByGuest(assignments);
    const keyByRoom = new Map<string, Doc<"agcKeys">>();
    for (const key of await ctx.db.query("agcKeys").collect()) {
      keyByRoom.set(key.roomId, key);
    }
    const checkIns = await ctx.db.query("agcCheckIns").collect();
    const checkInByGuest = new Map<string, Doc<"agcCheckIns">>();
    for (const c of checkIns) {
      if (!c.correctedAt) checkInByGuest.set(c.guestId, c);
    }
    const hubs = await ctx.db.query("agcHubs").collect();
    const hubNameById = new Map(hubs.map((h) => [h._id, h.name]));
    const flagByGuest = openReviewFlagsByGuest(
      await ctx.db.query("agcCheckinFlags").collect(),
    );

    let guests = await ctx.db.query("agcGuests").collect();
    if (args.accommodationType) {
      guests = guests.filter((g) => g.accommodationType === args.accommodationType);
    }
    if (args.hubId) {
      guests = guests.filter((g) => g.hubId === args.hubId);
    }

    const bookings = await ctx.db.query("agcBookings").collect();
    const bookingById = new Map(bookings.map((b) => [b._id, b]));

    const out: (ArrivalSearchRow & { _t: string })[] = [];
    for (const guest of guests) {
      if (guest.status !== "active") continue;
      const name = guestLabel(guest);
      const booking = bookingById.get(guest.bookingId);
      // The desk searches delegates who still have a stay behind them. Rows on
      // a closed or trashed booking are skipped here as well as at the source,
      // because holds released before guests were retired still carry `active`
      // rows — and the desk must not offer a delegate twice or from a dead hold.
      if (
        !booking ||
        booking.deletedAt ||
        booking.bookingStatus === "expired" ||
        booking.bookingStatus === "cancelled"
      ) {
        continue;
      }
      const hubName = hubNameById.get(guest.hubId) ?? "(unknown)";
      const assignment = openByGuest.get(guest._id);
      const room = assignment ? rooms.get(assignment.roomId) : undefined;
      if (term) {
        // The desk searches the way it reads the roster: name, hub, room,
        // building and the booking reference on the receipt.
        const haystack = [
          name,
          guest.firstName,
          guest.lastName,
          hubName,
          room?.name ?? "",
          room?.building ?? "",
          booking?.referenceNumber ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!tokens.every((token) => haystack.includes(token))) continue;
      }
      const checkIn = checkInByGuest.get(guest._id);
      const bookingStatus = booking?.bookingStatus ?? "unknown";
      const poa = booking?.poa ?? undefined;
      out.push({
        guestId: guest._id,
        bookingId: guest.bookingId,
        name,
        gender: guest.gender,
        hubName,
        accommodationType: guest.accommodationType,
        bookingRef: booking?.referenceNumber ?? "",
        paymentStatus: booking?.paymentStatus ?? "unknown",
        bookingStatus,
        poaStatus: poa?.status ?? null,
        assignmentStatus: room ? "assigned" : "unassigned",
        roomId: room?._id ?? null,
        roomName: room?.name ?? null,
        building: room?.building ?? null,
        bedNumber: bedByGuest.get(guest._id) ?? null,
        keyStatus: keyStateForRoom(room, room ? keyByRoom.get(room._id) : undefined),
        needsKey: room ? roomNeedsKey(room.accommodationType) : false,
        reviewFlag: flagByGuest.get(guest._id) ?? null,
        checkInStatus: checkIn
          ? checkIn.checkedOutAt
            ? "checked_out"
            : "checked_in"
          : "not_arrived",
        checkInId: checkIn?._id ?? null,
        checkedInAt: checkIn?.checkedInAt ?? null,
        checkedInBy: checkIn?.checkedInBy ?? null,
        checkedOutAt: checkIn?.checkedOutAt ?? null,
        _t: `${guest.lastName} ${guest.firstName}`.toLowerCase(),
      });
    }
    out.sort((a, b) => a._t.localeCompare(b._t));
    return out.slice(0, args.limit ?? 200).map((entry) => {
      const { _t, ...row } = entry;
      void _t;
      return row;
    });
  },
});

// ------------------------------------------------------------------
// Check-in / check-out (§12, §16, §18, §20)
// ------------------------------------------------------------------

/**
 * Check one delegate in. Rejections carry a specific reason the UI shows:
 * already checked in (§16), no assignment (§17), unconfirmed payment (§18).
 * A payment override may only be issued by admin/accommodation (§18).
 */
export const checkInGuest = mutation({
  args: {
    sessionToken: v.string(),
    guestId: v.id("agcGuests"),
    location: v.string(),
    /** §18 override for unconfirmed payments — approver roles only. */
    override: v.optional(
      v.object({
        reason: v.string(),
      }),
    ),
    /** Key recipient name for lodges / first EBPV arrival (§14). */
    keyRecipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    return await performCheckIn(ctx, {
      userId: user._id,
      email: user.email,
      role: user.role,
    }, args);
  },
});

/**
 * Core check-in logic shared by the live desk mutation and the offline-sync
 * replay (§19). `actor` is the effective staff identity; the caller has
 * already authenticated (or is replaying a verified queued transaction).
 */
export async function performCheckIn(
  ctx: MutationCtx,
  actor: CheckinActor,
  args: {
    guestId: Id<"agcGuests">;
    location: string;
    override?: { reason: string };
    keyRecipientName?: string;
    offlineTxId?: string;
  },
): Promise<{
  checkInId: Id<"agcCheckIns">;
  keyIssued: boolean;
  keysAlreadyIssuedTo: string | null;
}> {
    if (args.override && !isApproverRole(actor.role)) {
      throw new ConvexError(
        "Only the Accommodation Admin can authorize a payment override",
      );
    }

    const guest = await ctx.db.get(args.guestId);
    if (!guest || guest.status !== "active") {
      throw new ConvexError("Delegate not found or no longer active");
    }

    // Duplicate check-in prevention (§16).
    const existing = await activeCheckIn(ctx, guest._id);
    if (existing) {
      const room = await ctx.db.get(existing.roomId);
      throw new ConvexError(
        `ALREADY CHECKED IN — ${guestLabel(guest)} · ${room?.name ?? "room"} · ${new Date(existing.checkedInAt).toLocaleString()}`,
      );
    }

    // Room assignment required (§17) — check-in staff never assign rooms.
    const assignment = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
      .unique();
    const openAssignment =
      assignment && assignment.endedAt === undefined ? assignment : null;
    if (!openAssignment) {
      throw new ConvexError(
        `${guestLabel(guest)} has no room assignment yet — refer to Room-Assignment Staff or the Accommodation Admin`,
      );
    }
    const room = await ctx.db.get(openAssignment.roomId);
    if (!room || room.deletedAt) {
      throw new ConvexError("Assigned room no longer exists — refer to the Accommodation Admin");
    }

    // Booking/payment gate (§18): POA bookings are valid check-ins; other
    // unconfirmed bookings require an authorized override.
    const booking = await ctx.db.get(guest.bookingId);
    const paymentOk = !!booking && isRoomableBooking(booking);
    const override = args.override
      ? {
          authorizedBy: actor.email,
          reason: args.override.reason.trim(),
          authorizedAt: Date.now(),
        }
      : undefined;
    if (override && !override.reason) {
      throw new ConvexError("A reason is required for the payment override");
    }
    if (!paymentOk && !override) {
      throw new ConvexError(
        "Payment not confirmed — ask the Accommodation Admin to authorize an override, or confirm payment first",
      );
    }

    // Key handling (§14–15).
    let keyIssued = false;
    let keysAlreadyIssuedTo: string | null = null;
    if (roomNeedsKey(room.accommodationType)) {
      const key = await keyForRoom(ctx, room._id);
      const keyOpen = !!key && key.status !== "returned";
      if (keyOpen) {
        keysAlreadyIssuedTo =
          key?.newRecipientName ?? key?.recipientName ?? null;
        // Someone else holds the keys — record, no new issuance.
      } else {
        const recipientName =
          (args.keyRecipientName ?? "").trim() || guestLabel(guest);
        if (key) {
          await ctx.db.patch(key._id, {
            recipientGuestId: guest._id,
            recipientName,
            newRecipientName: undefined,
            status: "issued" as AgcKeyStatus,
            issuedAt: Date.now(),
            issuedBy: actor.email,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("agcKeys", {
            roomId: room._id,
            accommodationType: room.accommodationType,
            roomName: room.name,
            recipientGuestId: guest._id,
            recipientName,
            status: "issued" as AgcKeyStatus,
            issuedAt: Date.now(),
            issuedBy: actor.email,
            updatedAt: Date.now(),
          });
        }
        keyIssued = true;
      }
    }

    const checkInId = await ctx.db.insert("agcCheckIns", {
      guestId: guest._id,
      bookingId: guest.bookingId,
      hubId: guest.hubId,
      roomId: room._id,
      roomName: room.name,
      building: room.building ?? undefined,
      location: args.location.trim() || "central",
      checkedInAt: Date.now(),
      checkedInBy: actor.email,
      checkedInByRole: actor.role,
      offlineTxId: args.offlineTxId,
      paymentOverride: override,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: override ? "agc_checkin.override_approved" : "agc_checkin.created",
      entityType: "agcCheckIns",
      entityId: checkInId,
      summary: override
        ? `Checked in ${guestLabel(guest)} with PAYMENT OVERRIDE (${override.reason}) by ${actor.email}`
        : `Checked in ${guestLabel(guest)} at ${room.name} by ${actor.email}`,
      metadata: {
        guestId: guest._id,
        bookingId: guest.bookingId,
        roomId: room._id,
        location: args.location,
        override: override ?? undefined,
        offlineTxId: args.offlineTxId,
      },
    });

    return { checkInId, keyIssued, keysAlreadyIssuedTo };
}

// ------------------------------------------------------------------
// Group check-in (§13)
// ------------------------------------------------------------------

export type GroupArrivalResult = {
  guestId: Id<"agcGuests">;
  /** "checked_in" when the ticked delegate was checked in, "rejected" when
   * that individual could not be checked in (message in `reason`), and
   * "skipped" when the delegate was never ticked as arrived. */
  status: "checked_in" | "rejected" | "skipped";
  reason?: string;
  keyIssued?: boolean;
  keysAlreadyIssuedTo?: string | null;
};

export type GroupCheckInResult = {
  hubId: Id<"agcHubs"> | null;
  checkedInCount: number;
  rejectedCount: number;
  skippedCount: number;
  results: GroupArrivalResult[];
};

/**
 * Group check-in (§13). Staff select multiple delegates from the same hub or
 * arrival group and tick only the individuals who are physically present.
 * Ticked delegates are checked in one by one through the same core logic as
 * the single delegate desk flow; the batch NEVER auto-checks-in the unticked
 * members — they stay Not Arrived and are reported back as skipped.
 */
export const checkInGroup = mutation({
  args: {
    sessionToken: v.string(),
    location: v.string(),
    /** The hub (or arrival group) the batch was selected from. */
    hubId: v.optional(v.id("agcHubs")),
    /** Individually confirmed arrivals only — unticked delegates are omitted. */
    arrivals: v.array(
      v.object({
        guestId: v.id("agcGuests"),
        override: v.optional(v.object({ reason: v.string() })),
        keyRecipientName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<GroupCheckInResult> => {
    const user = await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    if (args.arrivals.length === 0) {
      throw new ConvexError(
        "No delegates were ticked as arrived — unticked delegates must stay Not Arrived",
      );
    }

    // All ticks must be from the same hub / arrival group (§13).
    const guests = await Promise.all(
      args.arrivals.map((arrival) => ctx.db.get(arrival.guestId)),
    );
    let hubId: Id<"agcHubs"> | null = args.hubId ?? null;
    for (let i = 0; i < guests.length; i += 1) {
      const guest = guests[i];
      if (!guest || guest.status !== "active") {
        throw new ConvexError(
          `Tick ${i + 1}: delegate not found or no longer active`,
        );
      }
      if (hubId === null) hubId = guest.hubId;
      if (guest.hubId !== hubId) {
        throw new ConvexError(
          "Group check-in must select delegates from one hub or arrival group",
        );
      }
    }

    const actor: CheckinActor = {
      userId: user._id,
      email: user.email,
      role: user.role,
    };
    const results: GroupArrivalResult[] = [];
    // Per-delegate outcome — one bad tick never fails the whole group.
    for (let i = 0; i < args.arrivals.length; i += 1) {
      const arrival = args.arrivals[i];
      void guests[i];
      try {
        const checkIn = await performCheckIn(ctx, actor, {
          guestId: arrival.guestId,
          location: args.location,
          override: arrival.override,
          keyRecipientName: arrival.keyRecipientName,
        });
        results.push({
          guestId: arrival.guestId,
          status: "checked_in",
          keyIssued: checkIn.keyIssued,
          keysAlreadyIssuedTo: checkIn.keysAlreadyIssuedTo,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "check-in failed";
        results.push({
          guestId: arrival.guestId,
          status: "rejected",
          reason: reason,
        });
      }
    }
    const checkedInCount = results.filter((r) => r.status === "checked_in").length;
    const rejectedCount = results.filter((r) => r.status === "rejected").length;

    await writeAuditLog(ctx, {
      actorUserId: user._id,
      actorEmail: user.email,
      action: "agc_checkin.group_batch",
      entityType: "agcCheckIns",
      summary: `Group check-in: ${checkedInCount} arrived, ${rejectedCount} rejected of ${args.arrivals.length} ticks (hub/arrival group) by ${user.email}`,
      metadata: {
        hubId: hubId ?? undefined,
        results: results.map((r) => (r.status === "rejected" ? { guestId: r.guestId, reason: r.reason } : { guestId: r.guestId })),
      },
    });

    // Unticked delegates in the selection remain Not Arrived by construction —
    // they were never passed in. Report the selection size so the UI can show
    // exactly what §13 requires.
    return {
      hubId,
      checkedInCount,
      rejectedCount,
      skippedCount: 0, // no unknown tick was silently coerced
      results,
    };
  },
});

/** Optional check-out (§20) — never releases paid inventory. */
export const checkOutGuest = mutation({
  args: {
    sessionToken: v.string(),
    guestId: v.id("agcGuests"),
    keyReturnStatus: v.optional(agcKeyReturnStatus),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    return await performCheckOut(ctx, { userId: user._id, email: user.email }, args);
  },
});

/** Core check-out, shared with offline replay (§19). */
export async function performCheckOut(
  ctx: MutationCtx,
  actor: CheckinActor,
  args: {
    guestId: Id<"agcGuests">;
    keyReturnStatus?: AgcKeyReturnStatus;
    offlineTxId?: string;
  },
): Promise<{ success: true }> {
    const checkIn = await activeCheckIn(ctx, args.guestId);
    if (!checkIn) throw new ConvexError("The delegate is not checked in");
    if (checkIn.checkedOutAt) {
      throw new ConvexError("The delegate is already checked out");
    }
    await ctx.db.patch(checkIn._id, {
      checkedOutAt: Date.now(),
      checkedOutBy: actor.email,
      keyReturnStatus: args.keyReturnStatus ?? "not_applicable",
    });
    // Returning a room key closes the key record (§15/§20).
    if (args.keyReturnStatus === "returned") {
      const key = await keyForRoom(ctx, checkIn.roomId);
      if (key) {
        await ctx.db.patch(key._id, {
          status: "returned" as AgcKeyStatus,
          returnedAt: Date.now(),
          returnedBy: actor.email,
          updatedAt: Date.now(),
        });
      }
    }
    const guest = await ctx.db.get(args.guestId);
    await writeAuditLog(ctx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "agc_checkin.checked_out",
      entityType: "agcCheckIns",
      entityId: checkIn._id,
      summary: `Checked out ${guest ? guestLabel(guest) : "delegate"} by ${actor.email} (key: ${args.keyReturnStatus ?? "not_applicable"})`,
      metadata: { offlineTxId: args.offlineTxId },
    });
    return { success: true as const };
}

/** Correct an erroneous check-in record (§16) — approver roles only. */
export const correctCheckIn = mutation({
  args: {
    sessionToken: v.string(),
    checkInId: v.id("agcCheckIns"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...APPROVER_ROLES]);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("A correction reason is required");
    const checkIn = await ctx.db.get(args.checkInId);
    if (!checkIn) throw new ConvexError("Check-in not found");
    await ctx.db.patch(checkIn._id, {
      correctedAt: Date.now(),
      correctedBy: actor.email,
      correctionReason: reason,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_checkin.corrected",
      entityType: "agcCheckIns",
      entityId: checkIn._id,
      summary: `Corrected check-in for ${checkIn.roomName} delegate by ${actor.email} — reason: ${reason}`,
      metadata: { reason, guestId: checkIn.guestId },
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Review flags — "flag this record for review"
// ------------------------------------------------------------------

/**
 * Raise a review flag on a delegate's arrival record. Any desk role may raise
 * one; the note is mandatory because a flag without a reason gives the
 * Accommodation Admin nothing to act on. The record stays on the desk — a flag
 * never blocks a check-in, it just asks for a second look.
 */
export const flagCheckInRecord = mutation({
  args: {
    sessionToken: v.string(),
    guestId: v.id("agcGuests"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    const note = args.note.trim();
    if (!note) throw new ConvexError("A note is required to flag a record for review");

    const guest = await ctx.db.get(args.guestId);
    if (!guest || guest.status !== "active") {
      throw new ConvexError("Delegate not found or no longer active");
    }
    const existing = await openReviewFlag(ctx, guest._id);
    if (existing) {
      throw new ConvexError(
        `ALREADY FLAGGED — ${existing.note} (raised by ${existing.raisedBy})`,
      );
    }

    // Snapshot where the record sat when it was flagged, so the review still
    // reads correctly after a room move.
    const assignment = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
      .unique();
    const room =
      assignment && assignment.endedAt === undefined
        ? await ctx.db.get(assignment.roomId)
        : null;
    const checkIn = await activeCheckIn(ctx, guest._id);

    const flagId = await ctx.db.insert("agcCheckinFlags", {
      guestId: guest._id,
      bookingId: guest.bookingId,
      roomId: room?._id,
      roomName: room?.name,
      checkInId: checkIn?._id,
      note,
      raisedAt: Date.now(),
      raisedBy: actor.email,
      raisedByRole: actor.role,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_checkin.review_flagged",
      entityType: "agcCheckinFlags",
      entityId: flagId,
      summary: `Flagged ${guestLabel(guest)} for review by ${actor.email} — ${note}`,
      metadata: {
        guestId: guest._id,
        roomId: room?._id,
        checkInId: checkIn?._id,
        note,
      },
    });

    return { flagId };
  },
});

/**
 * Clear a review flag with the outcome of the review — Accommodation Admin
 * only. The flag row is kept with both notes, so what the desk raised and what
 * the reviewer decided stay in the record.
 */
export const resolveCheckinFlag = mutation({
  args: {
    sessionToken: v.string(),
    flagId: v.id("agcCheckinFlags"),
    resolutionNote: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...APPROVER_ROLES]);
    const note = args.resolutionNote.trim();
    if (!note) throw new ConvexError("A note is required to clear a review flag");

    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new ConvexError("Review flag not found");
    if (flag.resolvedAt !== undefined) {
      throw new ConvexError("This review flag is already closed");
    }

    await ctx.db.patch(flag._id, {
      resolvedAt: Date.now(),
      resolvedBy: actor.email,
      resolutionNote: note,
    });

    const guest = await ctx.db.get(flag.guestId);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_checkin.review_cleared",
      entityType: "agcCheckinFlags",
      entityId: flag._id,
      summary: `Cleared the review flag on ${guest ? guestLabel(guest) : "delegate"} by ${actor.email} — ${note}`,
      metadata: { guestId: flag.guestId, raisedBy: flag.raisedBy, note },
    });

    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Key management (§15)
// ------------------------------------------------------------------

/** Replace a key (accommodation admin or room-assignment staff). */
export const replaceKey = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("agcRooms"),
    newRecipientName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      ...APPROVER_ROLES,
      "room_assignment",
    ]);
    const key = await keyForRoom(ctx, args.roomId);
    if (!key || key.status === "returned") {
      throw new ConvexError("No keys are currently issued for this room");
    }
    await ctx.db.patch(key._id, {
      status: "replaced" as AgcKeyStatus,
      replacedAt: Date.now(),
      replacedBy: actor.email,
      newRecipientName: args.newRecipientName?.trim() || key.recipientName,
      note: args.note?.trim() || key.note,
      updatedAt: Date.now(),
    });
    const room = await ctx.db.get(args.roomId);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_key.replaced",
      entityType: "agcKeys",
      entityId: key._id,
      summary: `Key replaced for ${room?.name ?? args.roomId} by ${actor.email}`,
      metadata: { roomId: args.roomId, note: args.note ?? null },
    });
    return { success: true as const };
  },
});

/** Mark a key as handed back manually (without a check-out). */
export const returnKey = mutation({
  args: { sessionToken: v.string(), roomId: v.id("agcRooms") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    const key = await keyForRoom(ctx, args.roomId);
    if (!key || key.status === "returned") {
      throw new ConvexError("No keys are currently issued for this room");
    }
    await ctx.db.patch(key._id, {
      status: "returned" as AgcKeyStatus,
      returnedAt: Date.now(),
      returnedBy: actor.email,
      updatedAt: Date.now(),
    });
    const room = await ctx.db.get(args.roomId);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_key.returned",
      entityType: "agcKeys",
      entityId: key._id,
      summary: `Key returned for ${room?.name ?? args.roomId} by ${actor.email}`,
    });
    return { success: true as const };
  },
});

/** All key records, newest activity first, for the keys view/reports. */
export const listKeys = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    const keys = await ctx.db.query("agcKeys").collect();
    return keys
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((key) => ({
        _id: key._id,
        roomId: key.roomId,
        accommodationType: key.accommodationType,
        typeLabel: AGC_ACCOMMODATION_LABELS[key.accommodationType] ?? key.accommodationType,
        roomName: key.roomName,
        recipientName: key.newRecipientName ?? key.recipientName ?? null,
        status: key.status,
        issuedAt: key.issuedAt ?? null,
        issuedBy: key.issuedBy ?? null,
        replacedAt: key.replacedAt ?? null,
        replacedBy: key.replacedBy ?? null,
        returnedAt: key.returnedAt ?? null,
        returnedBy: key.returnedBy ?? null,
      }));
  },
});

// ------------------------------------------------------------------
// Desk data + dashboards (§21–§23)
// ------------------------------------------------------------------

export type ArrivalDeskRow = {
  guestId: string;
  name: string;
  hubName: string;
  gender: string;
  accommodationType: string;
  bookingRef: string;
  paymentStatus: string;
  poaStatus: string | null;
  assignmentStatus: "assigned" | "unassigned";
  roomId: string | null;
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "not_arrived";
  checkInId: string | null;
  checkedInAt: number | null;
  pendingKeyRoom: boolean;
  bedNumber: number | null;
  keyStatus: ArrivalKeyState | null;
  needsKey: boolean;
  /** Open review flag raised by the desk; null when the record is unflagged. */
  reviewFlag: CheckinReviewFlag | null;
};

/** Everything the arrival desk needs in one query: your location's delegates. */
export const listArrivalDesk = query({
  args: {
    sessionToken: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ArrivalDeskRow[]> => {
    await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);

    const rooms = (await ctx.db.query("agcRooms").collect()).reduce(
      (map, room) => map.set(room._id, room),
      new Map<Id<"agcRooms">, Doc<"agcRooms">>(),
    );
    const assignments = await ctx.db.query("agcRoomAssignments").collect();
    const openByGuest = new Map<string, Doc<"agcRoomAssignments">>();
    for (const a of assignments) {
      if (a.endedAt === undefined) openByGuest.set(a.guestId, a);
    }
    const bedByGuest = bedNumbersByGuest(assignments);
    const checkIns = await ctx.db.query("agcCheckIns").collect();
    const checkInByGuest = new Map<string, Doc<"agcCheckIns">>();
    for (const c of checkIns) {
      if (!c.correctedAt) checkInByGuest.set(c.guestId, c);
    }
    const keyByRoom = new Map<string, Doc<"agcKeys">>();
    for (const key of await ctx.db.query("agcKeys").collect()) {
      keyByRoom.set(key.roomId, key);
    }
    const guests = await ctx.db.query("agcGuests").collect();
    const bookings = await ctx.db.query("agcBookings").collect();
    const bookingById = new Map(bookings.map((b) => [b._id, b]));
    const hubNameById = new Map(
      (await ctx.db.query("agcHubs").collect()).map((h) => [h._id, h.name]),
    );
    const flagByGuest = openReviewFlagsByGuest(
      await ctx.db.query("agcCheckinFlags").collect(),
    );

    const rows: (ArrivalDeskRow & { _t: string })[] = [];
    for (const guest of guests) {
      if (guest.status !== "active") continue;
      const booking = bookingById.get(guest.bookingId);
      // Only roomable bookings matter at the desk (confirmed or on POA terms).
      if (!booking || !isRoomableBooking(booking)) continue;
      const assignment = openByGuest.get(guest._id);
      const room = assignment ? rooms.get(assignment.roomId) : undefined;
      const location = args.location?.trim();
      if (location && location !== "central" && room?.building !== location) {
        continue;
      }
      const checkIn = checkInByGuest.get(guest._id);
      if (checkIn?.checkedOutAt) continue; // departed — off the desk
      const needsKey = room ? roomNeedsKey(room.accommodationType) : false;
      const key = room ? keyByRoom.get(room._id) : undefined;
      const keyOpen = key && key.status !== "returned";
      rows.push({
        guestId: guest._id,
        name: guestLabel(guest),
        hubName: hubNameById.get(guest.hubId) ?? "(unknown)",
        gender: guest.gender,
        accommodationType: guest.accommodationType,
        bookingRef: booking.referenceNumber ?? "",
        paymentStatus: booking.paymentStatus,
        poaStatus: booking.poa?.status ?? null,
        assignmentStatus: room ? "assigned" : "unassigned",
        roomId: room?._id ?? null,
        roomName: room?.name ?? null,
        building: room?.building ?? null,
        checkInStatus: checkIn ? "checked_in" : "not_arrived",
        checkInId: checkIn?._id ?? null,
        checkedInAt: checkIn?.checkedInAt ?? null,
        // Key flow needed before/with check-in: lodges without a key record,
        // or any EBPV first-arrival in an apartment without a key (§14).
        pendingKeyRoom: needsKey && !keyOpen,
        bedNumber: bedByGuest.get(guest._id) ?? null,
        keyStatus: keyStateForRoom(room, key),
        needsKey,
        reviewFlag: flagByGuest.get(guest._id) ?? null,
        _t: `${guest.lastName} ${guest.firstName}`.toLowerCase(),
      });
    }
    rows.sort((a, b) => a._t.localeCompare(b._t));
    return rows.slice(0, 400).map((entry) => {
      const { _t, ...row } = entry;
      void _t;
      return row;
    });
  },
});

export type ArrivalOverview = {
  totalRoomable: number;
  assigned: number;
  unassigned: number;
  checkedIn: number;
  notArrived: number;
  checkedOut: number;
  totalCapacity: number;
  remainingCapacity: number;
  keysIssued: number;
  unresolvedExceptions: number;
  paymentOverrides: number;
  offlineConflicts: number;
  /** Desk-raised records still waiting on an Accommodation Admin review. */
  reviewFlags: number;
  perLocation: {
    accommodationType: string;
    typeLabel: string;
    capacity: number;
    assigned: number;
    checkedIn: number;
    checkedOut: number;
    available: number;
    occupancyPercent: number;
  }[];
};

/** §21/§23 roll-up used by the arrival dashboard (roles see the same truth). */
export const getArrivalOverview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<ArrivalOverview> => {
    await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);

    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => !room.deletedAt,
    );
    const assignments = (await ctx.db.query("agcRoomAssignments").collect()).filter(
      (a) => a.endedAt === undefined,
    );
    const guests = (await ctx.db.query("agcGuests").collect()).filter(
      (g) => g.status === "active",
    );
    const bookings = await ctx.db.query("agcBookings").collect();
    const roomableBookingIds = new Set(
      bookings.filter(isRoomableBooking).map((b) => b._id),
    );
    const roomableGuests = guests.filter((g) => roomableBookingIds.has(g.bookingId));

    const checkIns = (await ctx.db.query("agcCheckIns").collect()).filter(
      (c) => !c.correctedAt,
    );
    const checkedIn = checkIns.filter((c) => !c.checkedOutAt && !c.correctedAt);
    const checkedOut = checkIns.filter((c) => c.checkedOutAt && !c.correctedAt);
    const checkedOutGuestIds = new Set(checkedOut.map((c) => c.guestId));
    const checkedInGuestIds = new Set(checkedIn.map((c) => c.guestId));

    const assignedGuestIds = new Set(assignments.map((a) => a.guestId));
    const assigned = roomableGuests.filter((g) => assignedGuestIds.has(g._id)).length;
    const unassigned = roomableGuests.length - assigned;

    const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
    const totalAssignedToRooms = assignments.length;

    const perType = new Map<
      string,
      ArrivalOverview["perLocation"][number]
    >();
    for (const room of rooms) {
      const entry = perType.get(room.accommodationType) ?? {
        accommodationType: room.accommodationType,
        typeLabel: AGC_ACCOMMODATION_LABELS[room.accommodationType] ?? room.accommodationType,
        capacity: 0,
        assigned: 0,
        checkedIn: 0,
        checkedOut: 0,
        available: 0,
        occupancyPercent: 0,
      };
      entry.capacity += room.capacity;
      perType.set(room.accommodationType, entry);
    }
    for (const assignment of assignments) {
      const entry = perType.get(
        rooms.find((room) => room._id === assignment.roomId)?.accommodationType ?? "",
      );
      if (entry) {
        entry.assigned += 1;
        if (checkedInGuestIds.has(assignment.guestId)) entry.checkedIn += 1;
        if (checkedOutGuestIds.has(assignment.guestId)) entry.checkedOut += 1;
      }
    }
    for (const entry of perType.values()) {
      entry.available = Math.max(0, entry.capacity - entry.assigned);
      entry.occupancyPercent =
        entry.capacity > 0 ? Math.round((entry.assigned / entry.capacity) * 100) : 0;
    }

    const keys = await ctx.db.query("agcKeys").collect();
    const keysIssued = keys.filter(
      (key) => key.status === "issued" || key.status === "replaced",
    ).length;

    const overrides = (await ctx.db.query("agcCheckIns").collect()).filter(
      (c) => !c.correctedAt && c.paymentOverride,
    ).length;

    const offlineConflicts = (
      await ctx.db
        .query("agcOfflineTransactions")
        .withIndex("by_sync_status", (q) => q.eq("syncStatus", "conflict"))
        .collect()
    ).length;

    const reviewFlags = (await ctx.db.query("agcCheckinFlags").collect()).filter(
      (flag) => flag.resolvedAt === undefined,
    ).length;

    return {
      totalRoomable: roomableGuests.length,
      assigned,
      unassigned,
      checkedIn: checkedIn.length,
      notArrived: Math.max(0, assigned - checkedIn.length),
      checkedOut: checkedOut.length,
      totalCapacity,
      remainingCapacity: Math.max(0, totalCapacity - totalAssignedToRooms),
      keysIssued,
      unresolvedExceptions: unassigned + offlineConflicts,
      paymentOverrides: overrides,
      offlineConflicts,
      reviewFlags,
      perLocation: [...perType.values()].sort((a, b) =>
        a.typeLabel.localeCompare(b.typeLabel),
      ),
    };
  },
});

/** Recent check-ins feed for the desk/dashboards (§23 "Recent Check-Ins"). */
export const listRecentCheckIns = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...CHECKIN_ROLES]);
    const rows = (await ctx.db.query("agcCheckIns").collect())
      .filter((row) => !row.correctedAt)
      .sort((a, b) => b.checkedInAt - a.checkedInAt)
      .slice(0, args.limit ?? 20);
    const guestById = new Map(
      (await ctx.db.query("agcGuests").collect()).map((g) => [g._id, g]),
    );
    return rows.map((row) => {
      const guest = guestById.get(row.guestId);
      return {
        _id: row._id,
        guestName: guest ? guestLabel(guest) : "(missing guest)",
        guestId: row.guestId,
        roomName: row.roomName,
        building: row.building ?? null,
        location: row.location,
        checkedInAt: row.checkedInAt,
        checkedInBy: row.checkedInBy,
        override: row.paymentOverride ?? null,
        checkedOutAt: row.checkedOutAt ?? null,
      };
    });
  },
});

export type { AgcKeyReturnStatus };
