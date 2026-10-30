import { query } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";

/**
 * Read-only delegate directory.
 *
 * One flat list of every active delegate with the rep and hub that booked them
 * and the room they were given. Volunteers work from this on their phones to
 * point people at the right room, so it is deliberately a single query: the
 * page groups and filters it locally without another round trip on flaky
 * mobile data.
 *
 * Nothing here writes. The gate includes the volunteer role, and every other
 * room/assignment surface stays closed to it.
 */

const DIRECTORY_ROLES = [
  "admin",
  "accommodation",
  "accommodation_volunteer",
] as const;

function personName(firstName?: string, lastName?: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

export const listDelegateDirectory = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...DIRECTORY_ROLES]);

    const hubs = await ctx.db.query("agcHubs").collect();
    const hubName = new Map(hubs.map((hub) => [hub._id as string, hub.name]));

    const reps = (await ctx.db.query("agcRepresentatives").collect()).filter(
      (rep) => !rep.deletedAt,
    );
    const repById = new Map(reps.map((rep) => [rep._id as string, rep]));

    const bookings = (await ctx.db.query("agcBookings").collect()).filter(
      (booking) => !booking.deletedAt,
    );
    const bookingById = new Map(
      bookings.map((booking) => [booking._id as string, booking]),
    );

    const guests = (await ctx.db.query("agcGuests").collect()).filter(
      (guest) => guest.status === "active",
    );

    // Open assignment rows only: a moved delegate keeps history, and the
    // directory always shows where they are now.
    const assignments = (
      await ctx.db.query("agcRoomAssignments").collect()
    ).filter((assignment) => assignment.endedAt === undefined);
    const roomIdByGuest = new Map<string, string>();
    for (const assignment of assignments) {
      if (!roomIdByGuest.has(assignment.guestId)) {
        roomIdByGuest.set(assignment.guestId, assignment.roomId);
      }
    }

    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => !room.deletedAt,
    );
    const roomById = new Map(rooms.map((room) => [room._id as string, room]));

    const checkIns = (await ctx.db.query("agcCheckIns").collect()).filter(
      (checkIn) => !checkIn.correctedAt,
    );
    const checkedIn = new Set(
      checkIns
        .filter((checkIn) => !checkIn.checkedOutAt)
        .map((checkIn) => checkIn.guestId as string),
    );

    const delegates = guests
      .map((guest) => {
        const booking = bookingById.get(guest.bookingId);
        if (!booking) return null;
        const rep = repById.get(booking.repId);
        if (!rep) return null;

        const room = roomById.get(roomIdByGuest.get(guest._id) ?? "");
        return {
          guestId: guest._id,
          name:
            `${guest.title} ${guest.firstName} ${guest.lastName}`.trim() ||
            personName(guest.firstName, guest.lastName),
          gender: guest.gender as string,
          repId: rep._id as string,
          repName: personName(rep.firstName, rep.lastName) || rep.username,
          hubName: hubName.get(rep.hubId) ?? "",
          region: booking.region as string,
          bookingRef: booking.referenceNumber ?? "",
          roomName: room?.name ?? null,
          building: room?.building ?? null,
          accommodationType: room?.accommodationType ?? null,
          typeLabel: room
            ? (AGC_ACCOMMODATION_LABELS[room.accommodationType] ??
              room.accommodationType)
            : null,
          checkedIn: checkedIn.has(guest._id),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const repSummaries = new Map<
      string,
      {
        repId: string;
        repName: string;
        hubName: string;
        region: string;
        delegateCount: number;
        assignedCount: number;
      }
    >();
    for (const delegate of delegates) {
      const existing = repSummaries.get(delegate.repId);
      if (existing) {
        existing.delegateCount += 1;
        if (delegate.roomName) existing.assignedCount += 1;
        continue;
      }
      repSummaries.set(delegate.repId, {
        repId: delegate.repId,
        repName: delegate.repName,
        hubName: delegate.hubName,
        region: delegate.region,
        delegateCount: 1,
        assignedCount: delegate.roomName ? 1 : 0,
      });
    }

    return {
      generatedAt: Date.now(),
      reps: [...repSummaries.values()].sort(
        (a, b) =>
          a.hubName.localeCompare(b.hubName) ||
          a.repName.localeCompare(b.repName),
      ),
      delegates: delegates.sort(
        (a, b) =>
          a.hubName.localeCompare(b.hubName) || a.name.localeCompare(b.name),
      ),
    };
  },
});
