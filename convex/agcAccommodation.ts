import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AGC_ACCOMMODATION_TYPES,
  AGC_DEFAULTS,
  AGC_INVENTORY_SEED,
  AGC_SETTING_KEYS,
  scopeForRegion,
} from "./lib/agcConfig";
import {
  getAccommodationTypesConfig,
  getBishopRate,
  getPoolTotalOverride,
  type AccommodationTypesConfig,
  type BishopRate,
} from "./lib/agcSettingsRuntime";
import type {
  AgcAccommodationType,
  AgcBookingStatus,
  AgcGender,
  AgcInventoryScope,
  AgcRegion,
} from "./schemaTypes";
import { writeAuditLog } from "./lib/audit";

/**
 * First row for an indexed query, or null — like .unique() but tolerant of
 * accidental duplicates (which .unique() treats as a hard error).
 */
async function firstOrNull<T extends { _id: unknown }>(
  query: { take: (n: number) => Promise<T[]> },
): Promise<T | null> {
  const rows = await query.take(1);
  return rows[0] ?? null;
}

// ------------------------------------------------------------------
// Settings helpers
// ------------------------------------------------------------------

export async function getHoldHours(ctx: QueryCtx): Promise<number> {
  const setting = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.holdHours))
    .unique();
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : AGC_DEFAULTS.holdHours;
}

export async function getDeadlineMs(ctx: QueryCtx): Promise<number> {
  const setting = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.deadline))
    .unique();
  if (!setting) return new Date(AGC_DEFAULTS.deadline).getTime();
  const parsed = new Date(setting.value).getTime();
  return Number.isNaN(parsed)
    ? new Date(AGC_DEFAULTS.deadline).getTime()
    : parsed;
}

/** §32–34: the hold window is the earlier of `holdHours` from now and the deadline. */
export async function computeHoldExpiry(ctx: QueryCtx): Promise<number> {
  const holdHours = await getHoldHours(ctx);
  const deadline = await getDeadlineMs(ctx);
  return Math.min(Date.now() + holdHours * 60 * 60 * 1000, deadline);
}

/**
 * Booking states whose beds still sit in a pool's `reserved` counter.
 *
 * A reservation awaiting payment does not have to be in `reserved`: a receipt
 * under review (`pending_verification`) or one the desk sent back
 * (`correction_requested`) still occupies beds, so every release and expiry
 * path must treat those as holding too — otherwise their beds are held forever.
 */
export function holdsReservedUnits(status: AgcBookingStatus): boolean {
  return (
    status === "reserved" ||
    status === "pending_verification" ||
    status === "correction_requested"
  );
}

/**
 * Whether the hold timer governs a booking at all.
 *
 * Payment-on-arrival accommodation is settled at the venue desk, so its beds
 * stay held until the desk confirms the payment or closes the booking by hand:
 * the reservation window (72h by default) deliberately does not release POA
 * beds. Every expiry path asks this first, so a POA hold can never be swept
 * while its payment is still outstanding.
 */
export function holdTimerApplies(
  booking: Pick<Doc<"agcBookings">, "poa">,
): boolean {
  return !booking.poa;
}

/**
 * When a booking's hold lapses, or `undefined` when nothing will lapse it —
 * payment-on-arrival holds (see `holdTimerApplies`) plus any reservation whose
 * window was never set. A lapsed deadline stops counting as held inventory
 * even before the sweep flips the booking to `expired`.
 */
export function holdDeadline(
  booking: Pick<Doc<"agcBookings">, "expiresAt" | "poa">,
): number | undefined {
  if (!holdTimerApplies(booking)) return undefined;
  return booking.expiresAt;
}

/** The pool a line of `type` booked from `region` draws its beds from (§28). */
export function poolScopeFor(
  type: AgcAccommodationType,
  region: AgcRegion,
): AgcInventoryScope {
  return AGC_ACCOMMODATION_TYPES[type].poolScope === "global"
    ? "global"
    : scopeForRegion(region);
}

export async function assertBeforeDeadline(ctx: MutationCtx) {
  // Registrations and bookings share one event-wide lockdown toggle.
  if (
    (await ctx.db
      .query("agcSettings")
      .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.lockdown))
      .unique())?.value === "true"
  ) {
    throw new ConvexError(
      "Registrations are temporarily locked by the convention administrators.",
    );
  }
  const deadline = await getDeadlineMs(ctx);
  if (Date.now() > deadline) {
    throw new ConvexError(
      "The accommodation deadline has passed. Contact the registration desk for assistance.",
    );
  }
}

// ------------------------------------------------------------------
// Inventory pools (SRS §28–31)
// ------------------------------------------------------------------

function seedFor(
  type: AgcAccommodationType,
  scope: AgcInventoryScope,
) {
  return AGC_INVENTORY_SEED.find(
    (entry) => entry.accommodationType === type && entry.scope === scope,
  );
}

async function loadPoolMutable(
  ctx: MutationCtx,
  type: AgcAccommodationType,
  scope: AgcInventoryScope,
): Promise<Doc<"agcInventoryPools">> {
  // Tolerate accidental duplicate rows instead of throwing like .unique()
  // does — duplicates have crashed whole pages before (imports/seed races).
  const pool = await firstOrNull(
    ctx.db
      .query("agcInventoryPools")
      .withIndex("by_type_scope", (q) =>
        q.eq("accommodationType", type).eq("scope", scope),
      ),
  );
  if (pool) return pool;

  // Lazily seed from defaults (or the admin's pool-total override) if the
  // admin seed hasn't run yet.
  const seed = seedFor(type, scope);
  if (!seed) {
    throw new Error(`No inventory pool configured for ${type} (${scope})`);
  }
  const override = await getPoolTotalOverride(ctx, type, scope);
  const poolId: Id<"agcInventoryPools"> = await ctx.db.insert(
    "agcInventoryPools",
    {
      accommodationType: type,
      scope,
      total: override ?? seed.total,
      reserved: 0,
      confirmed: 0,
    },
  );
  const created = await ctx.db.get(poolId);
  if (!created) throw new Error("Failed to create inventory pool");
  return created;
}

export async function getPoolForRegion(
  ctx: MutationCtx,
  type: AgcAccommodationType,
  region: Doc<"agcHubs">["region"],
): Promise<Doc<"agcInventoryPools">> {
  return await loadPoolMutable(ctx, type, poolScopeFor(type, region));
}

/** Read-only pool loader — falls back to seed defaults without writing. */
async function loadPoolRead(
  ctx: QueryCtx,
  type: AgcAccommodationType,
  scope: AgcInventoryScope,
): Promise<Doc<"agcInventoryPools">> {
  const pool = await firstOrNull(
    ctx.db
      .query("agcInventoryPools")
      .withIndex("by_type_scope", (q) =>
        q.eq("accommodationType", type).eq("scope", scope),
      ),
  );
  if (pool) return pool;

  const seed = seedFor(type, scope);
  if (!seed) {
    throw new Error(`No inventory pool configured for ${type} (${scope})`);
  }
  return {
    _id: "__seed__" as unknown as Id<"agcInventoryPools">,
    _creationTime: 0,
    accommodationType: type,
    scope,
    total: seed.total,
    reserved: 0,
    confirmed: 0,
  };
}

function availableUnits(pool: Doc<"agcInventoryPools">): number {
  return pool.total - pool.reserved - pool.confirmed;
}

async function writeLedger(
  ctx: MutationCtx,
  pool: Pick<Doc<"agcInventoryPools">, "_id" | "accommodationType" | "scope">,
  entry: {
    action:
      | "reserve"
      | "release"
      | "confirm"
      | "expire"
      | "cancel"
      | "reallocate"
      | "reconcile";
    delta: number;
    bookingId?: Id<"agcBookings">;
    actorEmail?: string;
    note?: string;
  },
) {
  await ctx.db.insert("agcInventoryLedger", {
    poolId: pool._id,
    accommodationType: pool.accommodationType,
    scope: pool.scope,
    action: entry.action,
    delta: entry.delta,
    bookingId: entry.bookingId,
    actorEmail: entry.actorEmail,
    note: entry.note,
    createdAt: Date.now(),
  });
}

/** Reserve units in a single pool. Throws when capacity is insufficient (§30). */
export async function reserveUnits(
  ctx: MutationCtx,
  pool: Doc<"agcInventoryPools">,
  units: number,
  bookingId: Id<"agcBookings">,
) {
  if (units <= 0) return;
  if (availableUnits(pool) < units) {
    throw new ConvexError(
      `Not enough ${AGC_ACCOMMODATION_TYPES[pool.accommodationType].label} capacity in the ${pool.scope.replace(/_/g, " ")} pool. Available: ${availableUnits(pool)}, requested: ${units}.`,
    );
  }
  await ctx.db.patch(pool._id, { reserved: pool.reserved + units });
  await writeLedger(ctx, pool, {
    action: "reserve",
    delta: units,
    bookingId,
  });
}

/** Release units from a pool (expiry / cancellation / admin release). */
export async function releaseUnits(
  ctx: MutationCtx,
  pool: Doc<"agcInventoryPools">,
  units: number,
  bookingId: Id<"agcBookings">,
  action: "release" | "expire" | "cancel",
) {
  if (units <= 0) return;
  const nextReserved = Math.max(0, pool.reserved - units);
  await ctx.db.patch(pool._id, { reserved: nextReserved });
  await writeLedger(ctx, pool, { action, delta: -units, bookingId });
}

/**
 * Return *confirmed* units to a pool — used when a confirmed accommodation is
 * deleted or withdrawn, so the beds re-enter the pool they were drawn from
 * instead of staying consumed forever.
 */
export async function releaseConfirmedUnits(
  ctx: MutationCtx,
  pool: Doc<"agcInventoryPools">,
  units: number,
  bookingId: Id<"agcBookings">,
  action: "release" | "expire" | "cancel",
) {
  if (units <= 0) return;
  await ctx.db.patch(pool._id, {
    confirmed: Math.max(0, pool.confirmed - units),
  });
  await writeLedger(ctx, pool, { action, delta: -units, bookingId });
}

/** Move units from reserved to confirmed after payment verification. */
export async function confirmBookingInventory(
  ctx: MutationCtx,
  bookingId: Id<"agcBookings">,
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking) return;

  const lines = await ctx.db
    .query("agcBookingLines")
    .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
    .collect();

  for (const line of lines) {
    const pool = await getPoolForRegion(
      ctx,
      line.accommodationType,
      booking.region,
    );
    const take = Math.min(line.quantity, pool.reserved);
    if (take <= 0) continue;
    await ctx.db.patch(pool._id, {
      reserved: pool.reserved - take,
      confirmed: pool.confirmed + take,
    });
    await writeLedger(ctx, pool, {
      action: "confirm",
      delta: take,
      bookingId,
    });
  }
}

// ------------------------------------------------------------------
// Booking lines & pricing (SRS §23–27, §38)
// ------------------------------------------------------------------

export type BookingGuestInput = {
  firstName: string;
  lastName: string;
  gender: AgcGender;
  title: string;
  phone?: string;
  email?: string;
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
};

export type ComputedLine = {
  accommodationType: AgcAccommodationType;
  /** Units consumed — one bed per guest for every type. */
  quantity: number;
  unitPrice: number;
  isBishopRate: boolean;
};

/** Group guests into priced lines. Every type is per-bed (1 unit per guest). */
export function computeBookingLines(
  guests: BookingGuestInput[],
  region: Doc<"agcHubs">["region"],
  typesConfig: AccommodationTypesConfig,
  bishopRate: BishopRate,
): ComputedLine[] {
  const groups = new Map<string, number>();
  for (const guest of guests) {
    const key = `${guest.accommodationType}|${guest.isBishopRate ? "bishop" : "standard"}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  const lines: ComputedLine[] = [];
  for (const [key, guestsInGroup] of groups) {
    const [type, rate] = key.split("|");
    const accommodationType = type as AgcAccommodationType;
    const isBishopRate = rate === "bishop";
    const ghsRegion = region === "ghana" || region === "west_africa";
    const config = typesConfig[accommodationType];
    // Every type is priced per bed — one unit per guest.
    const quantity = guestsInGroup;
    const unitPrice = isBishopRate
      ? ghsRegion ? bishopRate.ghs : bishopRate.usd
      : ghsRegion ? config.pricing.ghs : config.pricing.usd;
    lines.push({
      accommodationType,
      quantity,
      unitPrice,
      isBishopRate,
    });
  }
  return lines.sort((a, b) => a.accommodationType.localeCompare(b.accommodationType));
}

export function bookingTotal(lines: ComputedLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export function bookingCurrency(region: Doc<"agcHubs">["region"]): string {
  return region === "ghana" || region === "west_africa" ? "GHS" : "USD";
}

/**
 * Exact-amount rule: offline payments must equal the system total — nothing
 * less, nothing more. Tolerance only covers float rounding (half a cent).
 * Mirrored in src/lib/bookingMath.ts for the client-side rejection alert.
 */
export function amountsMatch(entered: number, expected: number): boolean {
  return Math.abs(entered - expected) < 0.005;
}

export function validateGuestInput(
  guest: BookingGuestInput,
  rowIndex: number,
): string | null {
  const label = `Row ${rowIndex}`;
  if (!guest.firstName.trim()) return `${label}: first name is required`;
  if (!guest.lastName.trim()) return `${label}: last name is required`;
  if (guest.gender !== "male" && guest.gender !== "female") {
    return `${label}: gender must be male or female`;
  }
  if (!guest.title.trim()) return `${label}: title is required`;
  if (!AGC_ACCOMMODATION_TYPES[guest.accommodationType]) {
    return `${label}: unknown accommodation type`;
  }
  return null;
}

// ------------------------------------------------------------------
// Booking creation (SRS §22, §38) — atomic reservation + pricing
// ------------------------------------------------------------------

export type CreateBookingResult = {
  bookingId: Id<"agcBookings">;
  referenceNumber: string;
  /**
   * Hold deadline — the earlier of the hold window and the registration
   * deadline — or `undefined` for a payment-on-arrival booking, whose beds the
   * hold timer never releases (see `holdTimerApplies`).
   */
  expiresAt: number | undefined;
  currency: string;
  totalAmount: number;
  lines: ComputedLine[];
};

export async function createBookingWithGuests(
  ctx: MutationCtx,
  args: {
    hub: Doc<"agcHubs">;
    rep: Doc<"agcRepresentatives">;
    guests: BookingGuestInput[];
    paymentMode: "offline" | "payment_on_arrival";
    referenceNumber: string;
  },
): Promise<CreateBookingResult> {
  const { hub, rep, guests } = args;
  if (guests.length === 0) {
    throw new ConvexError("Add at least one guest before booking");
  }

  // Validate every guest before touching inventory.
  for (let i = 0; i < guests.length; i += 1) {
    const error = validateGuestInput(guests[i], i + 1);
    if (error) throw new ConvexError(error);
  }

  const [typesConfig, bishopRate] = await Promise.all([
    getAccommodationTypesConfig(ctx),
    getBishopRate(ctx),
  ]);
  const lines = computeBookingLines(guests, hub.region, typesConfig, bishopRate);
  const total = bookingTotal(lines);
  const currency = bookingCurrency(hub.region);
  // A timed reservation holds its beds until the earlier of the configured
  // hold window (72h by default) and the registration deadline. A
  // payment-on-arrival booking is deliberately off that timer: it is settled at
  // the venue desk, so its beds stay held until the desk confirms the payment
  // or closes the booking (see `holdTimerApplies`).
  const isPoa = args.paymentMode === "payment_on_arrival";
  const expiresAt = isPoa ? undefined : await computeHoldExpiry(ctx);

  const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
    hubId: hub._id,
    repId: rep._id,
    region: hub.region,
    contactEmail: rep.email ?? undefined,
    contactPhone: rep.phone ?? undefined,
    currency,
    totalAmount: total,
    paymentMode: args.paymentMode,
    paymentStatus: "awaiting_payment",
    bookingStatus: "reserved",
    poa: isPoa ? { status: "pending" } : undefined,
    referenceNumber: args.referenceNumber,
    expiresAt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Reserve inventory per line (throws → whole mutation aborts atomically).
  for (const line of lines) {
    const pool = await getPoolForRegion(ctx, line.accommodationType, hub.region);
    await reserveUnits(ctx, pool, line.quantity, bookingId);
    await ctx.db.insert("agcBookingLines", {
      bookingId,
      accommodationType: line.accommodationType,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      isBishopRate: line.isBishopRate,
    });
  }

  for (const guest of guests) {
    await ctx.db.insert("agcGuests", {
      bookingId,
      hubId: hub._id,
      region: hub.region,
      country: hub.country,
      firstName: guest.firstName.trim(),
      lastName: guest.lastName.trim(),
      gender: guest.gender,
      title: guest.title.trim(),
      phone: guest.phone?.trim() || undefined,
      email: guest.email?.trim() || undefined,
      accommodationType: guest.accommodationType,
      pool: await (async () => {
        const pool = await getPoolForRegion(ctx, guest.accommodationType, hub.region);
        return pool.scope;
      })(),
      isBishopRate: guest.isBishopRate,
      status: "active",
      createdAt: Date.now(),
    });
  }

  return {
    bookingId,
    referenceNumber: args.referenceNumber,
    expiresAt,
    currency,
    totalAmount: total,
    lines,
  };
}

// ------------------------------------------------------------------
// Releases (expiry, cancellation)
// ------------------------------------------------------------------

/**
 * Return a booking's held beds to the pools they came from — the pool that
 * matches the line's accommodation type and the booking's region, so a bed
 * never lands in another region's or another type's pool.
 *
 * Reserved beds return from `reserved`; an already-confirmed booking returns
 * its beds from `confirmed` (deleting a confirmed accommodation frees it).
 * Closed bookings (expired/cancelled) have nothing left to return.
 */
export async function releaseBookingInventory(
  ctx: MutationCtx,
  booking: Doc<"agcBookings">,
  action: "release" | "expire" | "cancel",
) {
  const isConfirmed = booking.bookingStatus === "confirmed";
  // Closed bookings (expired/cancelled) have already handed their beds back —
  // releasing again would drive the counter below reality.
  if (!isConfirmed && !holdsReservedUnits(booking.bookingStatus)) return;

  const lines = await ctx.db
    .query("agcBookingLines")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect();

  for (const line of lines) {
    const pool = await getPoolForRegion(
      ctx,
      line.accommodationType,
      booking.region,
    );
    if (isConfirmed) {
      await releaseConfirmedUnits(ctx, pool, line.quantity, booking._id, action);
    } else {
      await releaseUnits(ctx, pool, line.quantity, booking._id, action);
    }
  }
}

/**
 * Retire a booking's guest rows when the booking itself closes (hold expired,
 * booking cancelled by the hub, or its receipt rejected).
 *
 * A guest row — not a booking — is the unit the desk searches, rooms and
 * exports, and nothing used to cascade the booking's status into it: a lapsed
 * hold handed its beds back but left its people `active` forever, so the hub's
 * re-book produced a second live copy of the same delegate and the arrival desk
 * listed both. Retiring the roster closes that loop. Rows are flipped to
 * `cancelled`, never deleted, so the booking keeps its names for history and
 * for the "book these beds again" prefill.
 *
 * Open room assignments end first — a retired guest must not keep holding a bed.
 * Returns how many rows were still active.
 */
export async function retireBookingGuests(
  ctx: MutationCtx,
  bookingId: Id<"agcBookings">,
  status: "expired" | "cancelled",
): Promise<number> {
  const active = (
    await ctx.db
      .query("agcGuests")
      .withIndex("by_booking", (q) => q.eq("bookingId", bookingId))
      .collect()
  ).filter((guest) => guest.status === "active");
  if (active.length === 0) return 0;

  const now = Date.now();
  for (const guest of active) {
    for (const assignment of await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
      .collect()) {
      if (assignment.endedAt !== undefined) continue;
      await ctx.db.patch(assignment._id, {
        endedAt: now,
        endReason: `Booking ${status}`,
      });
    }
    await ctx.db.patch(guest._id, { status: "cancelled" });
  }
  return active.length;
}

/**
 * Scheduled job: expire bookings whose hold has lapsed (§32–34). Expiring
 * returns the held beds to their pools and flips the booking to `expired`, so a
 * lapsed reservation never keeps counting as held inventory.
 *
 * Payment-on-arrival holds are exempt (`holdTimerApplies`): their beds stay
 * held until the venue desk confirms the payment or closes the booking, because
 * that money is handed over on arrival instead of inside a reservation window.
 */
export async function expireOverdueHolds(ctx: MutationCtx): Promise<number> {
  const now = Date.now();
  // Every open state holds beds, so every open state expires: a reservation
  // awaiting payment, one whose receipt is in review, and one bounced back to
  // the hub for a correction. Only `reserved` was swept before, which left
  // rows sent back for correction holding their beds indefinitely.
  const open = (
    await Promise.all(
      (["reserved", "pending_verification", "correction_requested"] as const).map(
        (status) =>
          ctx.db
            .query("agcBookings")
            .withIndex("by_booking_status", (q) => q.eq("bookingStatus", status))
            .collect(),
      ),
    )
  ).flat();

  let expired = 0;
  for (const booking of open) {
    if (booking.deletedAt) continue;
    // A POA hold is never on a timer — the desk releases it.
    if (!holdTimerApplies(booking)) continue;
    const deadline = holdDeadline(booking);
    if (!deadline || deadline >= now) continue;
    await releaseBookingInventory(ctx, booking, "expire");
    await ctx.db.patch(booking._id, {
      bookingStatus: "expired",
      updatedAt: now,
    });
    // The beds are gone, so its delegates are too: leaving the rows `active`
    // put the same people on the arrival desk twice once the hub re-booked.
    await retireBookingGuests(ctx, booking._id, "expired");
    await writeAuditLog(ctx, {
      actorEmail: "system",
      action: "agc_booking.hold_expired",
      entityType: "agcBookings",
      entityId: booking._id,
      summary: `Hold ${booking.referenceNumber ?? ""} expired — held beds returned to their pools`,
    });
    expired += 1;
  }
  return expired;
}

export type InventoryReconciliation = {
  /** Lapsed holds expired in this pass. */
  expiredHolds: number;
  /** Finished bookings that were still holding beds. */
  bookings: number;
  /** Beds moved back into the pools they came from. */
  units: number;
  /** Pools whose counters had to be rewritten to match the reservations. */
  poolsCorrected: number;
  /** Beds the stored counters had drifted by (in either direction). */
  counterBedsAdjusted: number;
};

/**
 * Return every bed a finished booking still holds.
 *
 * A booking that is `expired` or `cancelled` must have given its beds back,
 * but rows closed by older code paths can still be occupying a pool — a
 * confirmed booking trashed before confirmed units were released, for example.
 * The inventory ledger is the record of what each booking already returned, so
 * a booking only gets the difference between its bed lines and the releases
 * logged against it; running this a second time returns nothing.
 *
 * Lapsed `reserved` holds are expired first (the same pass the cron makes), so
 * one action repairs everything that is already past its hold window. The
 * pool counters are then rewritten to match the reservations, so availability
 * always agrees with the bookings behind it.
 */
export async function reconcileExpiredBookingInventory(
  ctx: MutationCtx,
  /** Who asked for the repair (an admin's email), or "system" for the cron. */
  actorEmail = "system",
): Promise<InventoryReconciliation> {
  const expiredHolds = await expireOverdueHolds(ctx);

  const [expired, cancelled, ledger] = await Promise.all([
    ctx.db
      .query("agcBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "expired"))
      .collect(),
    ctx.db
      .query("agcBookings")
      .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "cancelled"))
      .collect(),
    // The ledger has no booking index, so sweep it once (not per booking).
    ctx.db.query("agcInventoryLedger").collect(),
  ]);

  // How much each booking has already handed back, and how much of it was
  // taken from the pool's `confirmed` counter when it was paid.
  const released = new Map<string, number>();
  const confirmed = new Map<string, number>();
  for (const entry of ledger) {
    if (!entry.bookingId) continue;
    const key: string = entry.bookingId;
    if (
      entry.action === "release" ||
      entry.action === "expire" ||
      entry.action === "cancel"
    ) {
      released.set(key, (released.get(key) ?? 0) + Math.max(0, -entry.delta));
    } else if (entry.action === "confirm") {
      confirmed.set(key, Math.max(0, (confirmed.get(key) ?? 0) + entry.delta));
    }
  }

  let bookings = 0;
  let units = 0;
  for (const booking of [...expired, ...cancelled]) {
    const lines = await ctx.db
      .query("agcBookingLines")
      .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
      .collect();
    if (lines.length === 0) continue;

    const owed = lines.reduce((sum, line) => sum + line.quantity, 0);
    let outstanding = owed - (released.get(booking._id) ?? 0);
    if (outstanding <= 0) continue;

    // Confirmed units sit in the pool's `confirmed` counter; the rest are
    // still counted as reserved. Take from the right one, per line, so each
    // bed lands back in the pool it was drawn from.
    let fromConfirmed = Math.min(outstanding, confirmed.get(booking._id) ?? 0);
    let returned = 0;
    for (const line of lines) {
      const pool = await getPoolForRegion(
        ctx,
        line.accommodationType,
        booking.region,
      );
      const takeConfirmed = Math.min(line.quantity, fromConfirmed);
      if (takeConfirmed > 0) {
        await releaseConfirmedUnits(ctx, pool, takeConfirmed, booking._id, "release");
        fromConfirmed -= takeConfirmed;
        outstanding -= takeConfirmed;
        returned += takeConfirmed;
      }
      const takeReserved = Math.min(line.quantity - takeConfirmed, outstanding);
      if (takeReserved > 0) {
        await releaseUnits(ctx, pool, takeReserved, booking._id, "release");
        outstanding -= takeReserved;
        returned += takeReserved;
      }
    }

    if (returned <= 0) continue;
    bookings += 1;
    units += returned;
    await writeAuditLog(ctx, {
      actorEmail,
      action: "agc_booking.beds_returned_to_pool",
      entityType: "agcBookings",
      entityId: booking._id,
      summary: `Returned ${returned} bed(s) from ${booking.bookingStatus} booking ${booking.referenceNumber ?? ""} to its pool`,
      metadata: {
        units: returned,
        bookingStatus: booking.bookingStatus,
        referenceNumber: booking.referenceNumber ?? "",
      },
    });
  }

  // The counters are the booking gate, so the same pass rewrites any drift
  // left behind by older release paths — availability can never disagree with
  // the reservations that actually hold the beds.
  const counters = await reconcilePoolCounters(ctx, actorEmail);

  return {
    expiredHolds,
    bookings,
    units,
    poolsCorrected: counters.pools,
    counterBedsAdjusted: counters.beds,
  };
}

// ------------------------------------------------------------------
// Live inventory (counted from reservations, not just the pool counters)
// ------------------------------------------------------------------

export type PoolCounts = {
  _id: Id<"agcInventoryPools">;
  accommodationType: AgcAccommodationType;
  scope: AgcInventoryScope;
  total: number;
  /** Beds locked in by confirmed bookings. */
  confirmed: number;
  /** Beds reserved by active, unexpired reservations still awaiting payment. */
  held: number;
  /** `total - confirmed - held` — expired reservations never reduce this. */
  available: number;
  /** What the pool's own `reserved` counter says (ledger drift included). */
  ledgerReserved: number;
  /** What the pool's own `confirmed` counter says (ledger drift included). */
  ledgerConfirmed: number;
};

/**
 * Inventory counted from the reservations themselves.
 *
 * A bed is `confirmed` while its booking is confirmed, and `held` while its
 * booking is an open reservation (awaiting payment, in review, or sent back
 * for correction) that still has a live hold — payment-on-arrival holds have
 * no deadline at all, so they stay held until the desk acts on them. Expired
 * and cancelled reservations hold nothing, and a lapsed hold stops counting
 * even before the expiry sweep flips it — so a stale pool counter can never
 * show up as Held.
 *
 * The pool's stored counters stay the booking gate; `ledgerReserved` and
 * `ledgerConfirmed` expose any difference so the desk can see the drift and
 * `reconcilePoolCounters` can heal it.
 */
export async function livePoolCounts(ctx: QueryCtx): Promise<PoolCounts[]> {
  const [pools, bookings, lines] = await Promise.all([
    ctx.db.query("agcInventoryPools").collect(),
    ctx.db.query("agcBookings").collect(),
    ctx.db.query("agcBookingLines").collect(),
  ]);

  const linesByBooking = new Map<string, Doc<"agcBookingLines">[]>();
  for (const line of lines) {
    const list = linesByBooking.get(line.bookingId);
    if (list) list.push(line);
    else linesByBooking.set(line.bookingId, [line]);
  }

  const now = Date.now();
  const counts = new Map<string, { confirmed: number; held: number }>();
  const entryFor = (type: AgcAccommodationType, scope: AgcInventoryScope) => {
    const key = `${type}|${scope}`;
    let entry = counts.get(key);
    if (!entry) {
      entry = { confirmed: 0, held: 0 };
      counts.set(key, entry);
    }
    return entry;
  };

  for (const booking of bookings) {
    if (booking.deletedAt) continue;
    const isConfirmed = booking.bookingStatus === "confirmed";
    if (!isConfirmed) {
      if (!holdsReservedUnits(booking.bookingStatus)) continue;
      const deadline = holdDeadline(booking);
      if (deadline !== undefined && deadline <= now) continue;
    }
    for (const line of linesByBooking.get(booking._id) ?? []) {
      const entry = entryFor(
        line.accommodationType,
        poolScopeFor(line.accommodationType, booking.region),
      );
      if (isConfirmed) entry.confirmed += line.quantity;
      else entry.held += line.quantity;
    }
  }

  return pools.map((pool) => {
    const entry = counts.get(`${pool.accommodationType}|${pool.scope}`) ?? {
      confirmed: 0,
      held: 0,
    };
    return {
      _id: pool._id,
      accommodationType: pool.accommodationType,
      scope: pool.scope,
      total: pool.total,
      confirmed: entry.confirmed,
      held: entry.held,
      available: pool.total - entry.confirmed - entry.held,
      ledgerReserved: pool.reserved,
      ledgerConfirmed: pool.confirmed,
    };
  });
}

export type PoolCounterRepair = {
  /** Pools whose stored counters had to be rewritten. */
  pools: number;
  /** Beds the stored counters had drifted by (in either direction). */
  beds: number;
};

/**
 * Rewrite each pool's stored `reserved`/`confirmed` counters to what the
 * reservations say they should be — the self-healing half of the inventory.
 *
 * `livePoolCounts` is the single source of truth, but the stored counters are
 * what the booking gate compares against, so any drift between the two
 * misstates availability: a bed released twice by an older path, a confirm
 * that never moved a bed out of `reserved`, a hold expired after its beds were
 * already returned. Every pass copies the live counts back into the counters,
 * records what moved on the inventory ledger, and audits the correction.
 * Counters that already agree are left untouched, so running it again finds
 * nothing and the crons can call it as often as they like.
 */
export async function reconcilePoolCounters(
  ctx: MutationCtx,
  actorEmail = "system",
): Promise<PoolCounterRepair> {
  const pools = await livePoolCounts(ctx);
  let poolsCorrected = 0;
  let beds = 0;

  for (const pool of pools) {
    const heldDelta = pool.held - pool.ledgerReserved;
    const confirmedDelta = pool.confirmed - pool.ledgerConfirmed;
    if (heldDelta === 0 && confirmedDelta === 0) continue;

    await ctx.db.patch(pool._id, {
      reserved: pool.held,
      confirmed: pool.confirmed,
    });
    if (heldDelta !== 0) {
      await writeLedger(ctx, pool, {
        action: "reconcile",
        delta: heldDelta,
        actorEmail,
        note: `Held counter corrected to the live reservations (${pool.ledgerReserved} → ${pool.held})`,
      });
    }
    if (confirmedDelta !== 0) {
      await writeLedger(ctx, pool, {
        action: "reconcile",
        delta: confirmedDelta,
        actorEmail,
        note: `Confirmed counter corrected to the live bookings (${pool.ledgerConfirmed} → ${pool.confirmed})`,
      });
    }

    poolsCorrected += 1;
    beds += Math.abs(heldDelta) + Math.abs(confirmedDelta);
    await writeAuditLog(ctx, {
      actorEmail,
      action: "agc_pool.counters_reconciled",
      entityType: "agcInventoryPools",
      entityId: pool._id,
      summary: `Reconciled ${pool.accommodationType} (${pool.scope.replace(/_/g, " ")}) counters to the reservations — held ${pool.ledgerReserved} → ${pool.held}, confirmed ${pool.ledgerConfirmed} → ${pool.confirmed}`,
      metadata: { heldDelta, confirmedDelta },
    });
  }

  return { pools: poolsCorrected, beds };
}

// ------------------------------------------------------------------
// Substitutions (SRS §42–44) — same gender + same type; history kept
// ------------------------------------------------------------------

export type SubstitutionCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function checkSubstitution(
  previous: Pick<
    Doc<"agcGuests">,
    "gender" | "accommodationType" | "status"
  >,
  next: { gender: AgcGender; accommodationType: AgcAccommodationType },
  allowOverride: boolean,
): SubstitutionCheck {
  if (previous.status !== "active") {
    return { ok: false, reason: "This guest is not active" };
  }
  const sameGender = previous.gender === next.gender;
  const sameType = previous.accommodationType === next.accommodationType;
  if (sameGender && sameType) return { ok: true };
  if (allowOverride) return { ok: true };
  return {
    ok: false,
    reason: `Substitutions must keep the same gender and accommodation type (was ${previous.gender} ${previous.accommodationType})`,
  };
}

export async function applySubstitution(
  ctx: MutationCtx,
  args: {
    guest: Doc<"agcGuests">;
    next: {
      firstName: string;
      lastName: string;
      gender: AgcGender;
      title: string;
      phone?: string;
      email?: string;
    };
    allowOverride: boolean;
    actorRepId?: Id<"agcRepresentatives">;
    actorAdminEmail?: string;
    reason?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const guest = args.guest;
  const booking = await ctx.db.get(guest.bookingId);
  if (!booking) return { ok: false, reason: "Booking not found" };
  if (
    booking.bookingStatus === "expired" ||
    booking.bookingStatus === "cancelled"
  ) {
    return {
      ok: false,
      reason: "This booking is no longer active — substitutions are closed",
    };
  }

  const check = checkSubstitution(
    guest,
    {
      gender: args.next.gender,
      accommodationType: guest.accommodationType, // type never changes (§43)
    },
    args.allowOverride,
  );
  if (!check.ok) return check;

  await ctx.db.patch(guest._id, {
    firstName: args.next.firstName.trim(),
    lastName: args.next.lastName.trim(),
    gender: args.next.gender,
    title: args.next.title.trim(),
    phone: args.next.phone?.trim() || undefined,
    email: args.next.email?.trim() || undefined,
  });

  await ctx.db.insert("agcSubstitutions", {
    bookingId: guest.bookingId,
    guestId: guest._id,
    previousFirstName: guest.firstName,
    previousLastName: guest.lastName,
    previousGender: guest.gender,
    previousType: guest.accommodationType,
    newFirstName: args.next.firstName.trim(),
    newLastName: args.next.lastName.trim(),
    newGender: args.next.gender,
    newType: guest.accommodationType,
    overrideByAdmin: Boolean(args.actorAdminEmail),
    actorRepId: args.actorRepId,
    actorAdminEmail: args.actorAdminEmail,
    reason: args.reason,
    createdAt: Date.now(),
  });

  return { ok: true };
}

// ------------------------------------------------------------------
// Availability snapshot for the portal UI
// ------------------------------------------------------------------

export type AvailabilityRow = {
  accommodationType: AgcAccommodationType;
  scope: AgcInventoryScope;
  total: number;
  available: number;
  priceGhs: number;
  priceUsd: number;
  bishopPriceGhs: number;
  bishopPriceUsd: number;
};

export async function availabilityForRegion(
  ctx: QueryCtx,
  region: Doc<"agcHubs">["region"],
): Promise<AvailabilityRow[]> {
  const [typesConfig, bishopRate] = await Promise.all([
    getAccommodationTypesConfig(ctx),
    getBishopRate(ctx),
  ]);
  const rows: AvailabilityRow[] = [];
  for (const type of Object.keys(AGC_ACCOMMODATION_TYPES) as AgcAccommodationType[]) {
    const scope: AgcInventoryScope =
      typesConfig[type].poolScope === "global"
        ? "global"
        : scopeForRegion(region);
    const pool = await loadPoolRead(ctx, type, scope);
    const config = typesConfig[type];
    rows.push({
      accommodationType: type,
      scope: pool.scope,
      total: pool.total,
      available: availableUnits(pool),
      priceGhs: config.pricing.ghs,
      priceUsd: config.pricing.usd,
      bishopPriceGhs: type === "ebpv" ? bishopRate.ghs : config.pricing.ghs,
      bishopPriceUsd: type === "ebpv" ? bishopRate.usd : config.pricing.usd,
    });
  }
  return rows;
}
