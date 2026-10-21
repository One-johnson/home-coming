import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";
import { isRoomableBooking } from "./agcRoomAssignments";

/** §24 reports are for administrators — admin, accommodation and finance. */
export const requireReportAccess = internalQuery({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    return await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
  },
});

/**
 * Row sources for the Phase 2 operational reports (§24). Lives here (not in
 * the "use node" file) because only actions may import node bindings.
 * Called by agcOpsExcel.ts via ctx.runQuery(internal.agcOpsData.getRows…).
 */

function label(type: string): string {
  return AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;
}

function fmt(ts: number | undefined | null): string {
  return ts ? new Date(ts).toISOString().replace("T", " ").slice(0, 19) : "";
}

// ------------------------------------------------------------------
// Shared data assembly
// ------------------------------------------------------------------

async function collect(ctx: QueryCtx) {
  const rooms = (await ctx.db.query("agcRooms").collect()).filter((r) => !r.deletedAt);
  const roomById = new Map(rooms.map((r) => [r._id, r]));
  const assignments = await ctx.db.query("agcRoomAssignments").collect();
  const guests = await ctx.db.query("agcGuests").collect();
  const guestById = new Map(guests.map((g) => [g._id, g]));
  const bookings = await ctx.db.query("agcBookings").collect();
  const bookingById = new Map(bookings.map((b) => [b._id, b]));
  const hubs = await ctx.db.query("agcHubs").collect();
  const hubById = new Map(hubs.map((h) => [h._id, h]));
  const checkIns = (await ctx.db.query("agcCheckIns").collect()).filter(
    (row) => !row.correctedAt,
  );
  const keys = await ctx.db.query("agcKeys").collect();
  const offline = await ctx.db.query("agcOfflineTransactions").collect();
  const audit = await ctx.db.query("auditLogs").collect();
  return {
    rooms,
    roomById,
    assignments,
    guests,
    guestById,
    bookings,
    bookingById,
    hubs,
    hubById,
    checkIns,
    keys,
    offline,
    audit,
  };
}

function guestName(
  guestById: Map<string, { title: string; firstName: string; lastName: string }>,
  guestId: string,
): string {
  const guest = guestById.get(guestId);
  return guest ? `${guest.title} ${guest.firstName} ${guest.lastName}`.trim() : "(missing)";
}

function hubName(hubById: Map<string, { name: string }>, hubId: string): string {
  return hubById.get(hubId)?.name ?? "(unknown)";
}

// ------------------------------------------------------------------
// One loader per report, taking optional filters (§24)
// ------------------------------------------------------------------

export const getReportRows = internalQuery({
  args: {
    report: v.string(),
    accommodationType: v.optional(v.string()),
    building: v.optional(v.string()),
    hubId: v.optional(v.id("agcHubs")),
    gender: v.optional(v.string()),
    roomId: v.optional(v.id("agcRooms")),
  },
  handler: async (ctx, args) => {
    const data = await collect(ctx);

    const filterRoom = (room: { accommodationType: string; building?: string; _id: string }) =>
      (!args.accommodationType || room.accommodationType === args.accommodationType) &&
      (!args.building || room.building === args.building) &&
      (!args.roomId || room._id === args.roomId);

    switch (args.report) {
      case "room_assignments": {
        return data.assignments
          .filter((a) => a.endedAt === undefined)
          .filter((a) => {
            const room = data.roomById.get(a.roomId);
            return !room || filterRoom(room);
          })
          .map((a) => {
            const room = data.roomById.get(a.roomId);
            const guest = data.guestById.get(a.guestId);
            const booking = data.bookingById.get(a.bookingId);
            return {
              room: room?.name ?? "(deleted room)",
              type: label(room?.accommodationType ?? ""),
              building: room?.building ?? "",
              capacity: room?.capacity ?? 0,
              guest: guest ? guestName(data.guestById, a.guestId) : "(missing)",
              gender: guest?.gender ?? "",
              hub: booking ? hubName(data.hubById, booking.hubId) : "",
              bookingRef: booking?.referenceNumber ?? "",
              assignedBy: a.assignedBy ?? "",
              assignedAt: fmt(a.createdAt),
            };
          })
          .sort((r1, r2) => r1.type.localeCompare(r2.type) || r1.room.localeCompare(r2.room, undefined, { numeric: true }));
      }
      case "unassigned_delegates": {
        return data.guests
          .filter((g) => g.status === "active")
          .filter((g) => {
            const booking = data.bookingById.get(g.bookingId);
            return booking && isRoomableBooking(booking);
          })
          .filter((g) => !data.assignments.some((a) => a.guestId === g._id && a.endedAt === undefined))
          .filter((g) => (!args.accommodationType || g.accommodationType === args.accommodationType) &&
            (!args.gender || g.gender === args.gender))
          .filter((g) => !args.hubId || g.hubId === args.hubId)
          .map((g) => {
            const booking = data.bookingById.get(g.bookingId);
            return {
              guest: guestName(data.guestById, g._id),
              gender: g.gender,
              type: label(g.accommodationType),
              hub: hubName(data.hubById, g.hubId),
              bookingRef: booking?.referenceNumber ?? "",
              paymentStatus: booking?.paymentStatus ?? "",
            };
          })
          .sort((r1, r2) => r1.hub.localeCompare(r2.hub) || r1.guest.localeCompare(r2.guest));
      }
      case "checked_in": {
        return data.checkIns
          .filter((c) => !c.checkedOutAt)
          .filter((c) => {
            const guest = data.guestById.get(c.guestId);
            return (!args.accommodationType ||
              data.roomById.get(c.roomId)?.accommodationType === args.accommodationType ||
              guest?.accommodationType === args.accommodationType) &&
              (!args.building || c.building === args.building) &&
              (!args.hubId || c.hubId === args.hubId) &&
              (!args.gender || guest?.gender === args.gender);
          })
          .map((c) => {
            const guest = data.guestById.get(c.guestId);
            const booking = data.bookingById.get(c.bookingId);
            return {
              guest: guest ? guestName(data.guestById, c.guestId) : "(missing)",
              gender: guest?.gender ?? "",
              hub: hubName(data.hubById, c.hubId),
              room: c.roomName,
              building: c.building ?? "",
              type: label(data.roomById.get(c.roomId)?.accommodationType ?? guest?.accommodationType ?? ""),
              bookingRef: booking?.referenceNumber ?? "",
              checkedIn: fmt(c.checkedInAt),
              by: c.checkedInBy,
            };
          })
          .sort((r1, r2) => r1.checkedIn.localeCompare(r2.checkedIn));
      }
      case "not_arrived": {
        return data.guests
          .filter((g) => g.status === "active")
          .filter((g) => {
            const booking = data.bookingById.get(g.bookingId);
            return booking && isRoomableBooking(booking);
          })
          .filter((g) => {
            const hasOpen = data.assignments.some((a) => a.guestId === g._id && a.endedAt === undefined);
            const checked = data.checkIns.some((c) => c.guestId === g._id);
            // Roomed-but-not-arrived is the operational queue (§21).
            return hasOpen && !checked;
          })
          .filter((g) => (!args.accommodationType || g.accommodationType === args.accommodationType) &&
            (!args.gender || g.gender === args.gender))
          .filter((g) => !args.hubId || g.hubId === args.hubId)
          .map((g) => {
            const booking = data.bookingById.get(g.bookingId);
            const assignment = data.assignments.find((a) => a.guestId === g._id && a.endedAt === undefined);
            const room = assignment ? data.roomById.get(assignment.roomId) : undefined;
            return {
              guest: guestName(data.guestById, g._id),
              gender: g.gender,
              hub: hubName(data.hubById, g.hubId),
              type: label(g.accommodationType),
              room: room?.name ?? "",
              building: room?.building ?? "",
              bookingRef: booking?.referenceNumber ?? "",
            };
          })
          .sort((r1, r2) => r1.hub.localeCompare(r2.hub) || r1.guest.localeCompare(r2.guest));
      }
      case "check_out": {
        return data.checkIns
          .filter((c) => c.checkedOutAt)
          .filter((c) => (!args.building || c.building === args.building))
          .map((c) => ({
            guest: guestName(data.guestById, c.guestId),
            hub: hubName(data.hubById, c.hubId),
            room: c.roomName,
            building: c.building ?? "",
            checkedIn: fmt(c.checkedInAt),
            checkedOut: fmt(c.checkedOutAt),
            by: c.checkedOutBy ?? "",
            keyReturn: c.keyReturnStatus ?? "",
          }));
      }
      case "key_issuance": {
        return data.keys
          .filter((key) => key.issuedAt)
          .filter((key) => (!args.accommodationType || key.accommodationType === args.accommodationType))
          .map((key) => ({
            room: key.roomName,
            type: label(key.accommodationType),
            recipient: key.recipientName ?? "",
            status: key.status,
            issued: fmt(key.issuedAt),
            by: key.issuedBy ?? "",
            building: data.roomById.get(key.roomId)?.building ?? "",
          }));
      }
      case "key_replacement": {
        return data.keys
          .filter((key) => key.replacedAt)
          .map((key) => ({
            room: key.roomName,
            type: label(key.accommodationType),
            recipient: key.newRecipientName ?? key.recipientName ?? "",
            status: key.status,
            replaced: fmt(key.replacedAt),
            by: key.replacedBy ?? "",
          }));
      }
      case "room_changes": {
        return data.assignments
          .filter((a) => a.endedAt !== undefined)
          .filter((a) => {
            const room = data.roomById.get(a.roomId);
            return (!args.accommodationType || room?.accommodationType === args.accommodationType) &&
              (!args.building || room?.building === args.building);
          })
          .map((a) => {
            const room = data.roomById.get(a.roomId);
            return {
              guest: guestName(data.guestById, a.guestId),
              fromRoom: room?.name ?? "(deleted)",
              fromBuilding: room?.building ?? "",
              ended: fmt(a.endedAt),
              reason: a.endReason ?? "",
              by: a.endBy ?? "",
              movedTo: (() => {
                if (!a.replacedByAssignmentId) return "";
                const replacement = data.assignments.find(
                  (x) => x._id === a.replacedByAssignmentId,
                );
                return replacement ? data.roomById.get(replacement.roomId)?.name ?? "" : "";
              })(),
            };
          })
          .sort((r1, r2) => r2.ended.localeCompare(r1.ended));
      }
      case "payment_overrides": {
        return data.checkIns
          .filter((c) => c.paymentOverride)
          .map((c) => ({
            guest: guestName(data.guestById, c.guestId),
            hub: hubName(data.hubById, c.hubId),
            room: c.roomName,
            checkedIn: fmt(c.checkedInAt),
            overrideBy: c.paymentOverride?.authorizedBy ?? "",
            reason: c.paymentOverride?.reason ?? "",
            overrideAt: fmt(c.paymentOverride?.authorizedAt),
            corrected: c.correctedAt ? fmt(c.correctedAt) : "",
          }));
      }
      case "offline_sync": {
        return data.offline
          .filter((tx) => tx.syncStatus === "conflict" || tx.syncStatus === "rejected")
          .map((tx) => ({
            txId: tx.txId,
            staffId: tx.staffId,
            building: tx.building,
            action: tx.action,
            originalAt: fmt(tx.originalAt),
            status: tx.syncStatus,
            reason: tx.conflictReason ?? "",
          }));
      }
      case "check_in_activity": {
        return data.checkIns
          .map((c) => ({
            guest: guestName(data.guestById, c.guestId),
            hub: hubName(data.hubById, c.hubId),
            room: c.roomName,
            location: c.location,
            building: c.building ?? "",
            checkedIn: fmt(c.checkedInAt),
            by: `${c.checkedInBy} (${c.checkedInByRole ?? "staff"})`,
            checkedOut: fmt(c.checkedOutAt),
            correction: c.correctedAt ? `corrected ${fmt(c.correctedAt)}: ${c.correctionReason ?? ""}` : "",
          }))
          .sort((r1, r2) => r2.checkedIn.localeCompare(r1.checkedIn));
      }
      case "occupancy": {
        return data.rooms
          .filter((room) => filterRoom(room))
          .map((room) => {
          const beds = data.assignments.filter((a) => a.roomId === room._id && a.endedAt === undefined).length;
          const checkedInBeds = data.checkIns.filter(
            (c) => c.roomId === room._id && !c.checkedOutAt,
          ).length;
          return {
            room: room.name,
            type: label(room.accommodationType),
            building: room.building ?? "",
            genderLock: room.gender ?? "",
            capacity: room.capacity,
            assigned: beds,
            checkedIn: checkedInBeds,
            available: Math.max(0, room.capacity - beds),
            occupancyPercent: room.capacity ? `${Math.round((beds / room.capacity) * 100)}%` : "0%",
          };
        })
          .sort((r1, r2) => r1.type.localeCompare(r2.type) || r1.room.localeCompare(r2.room, undefined, { numeric: true }));
      }
      default:
        return [];
    }
  },
});
