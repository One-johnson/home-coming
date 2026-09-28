import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AGC_ACCOMMODATION_TYPES,
  AGC_BISHOP_RATE,
  AGC_DEFAULTS,
  AGC_INVENTORY_SEED,
  AGC_SETTING_KEYS,
  accommodationPrice,
  scopeForRegion,
} from "./lib/agcConfig";
import type {
  AgcAccommodationType,
  AgcGender,
  AgcInventoryScope,
} from "./schemaTypes";

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

export async function assertBeforeDeadline(ctx: MutationCtx) {
  const deadline = await getDeadlineMs(ctx);
  if (Date.now() > deadline) {
    throw new Error(
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

  // Lazily seed from defaults if the admin seed hasn't run yet.
  const seed = seedFor(type, scope);
  if (!seed) {
    throw new Error(`No inventory pool configured for ${type} (${scope})`);
  }
  const poolId: Id<"agcInventoryPools"> = await ctx.db.insert(
    "agcInventoryPools",
    {
      accommodationType: type,
      scope,
      total: seed.total,
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
  const scope: AgcInventoryScope =
    AGC_ACCOMMODATION_TYPES[type].poolScope === "global"
      ? "global"
      : scopeForRegion(region);
  return await loadPoolMutable(ctx, type, scope);
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
  pool: Doc<"agcInventoryPools">,
  entry: {
    action: "reserve" | "release" | "confirm" | "expire" | "cancel" | "reallocate";
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
async function reserveUnits(
  ctx: MutationCtx,
  pool: Doc<"agcInventoryPools">,
  units: number,
  bookingId: Id<"agcBookings">,
) {
  if (units <= 0) return;
  if (availableUnits(pool) < units) {
    throw new Error(
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
async function releaseUnits(
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
  /** Units consumed: beds for dormitory/hostel, rooms otherwise. */
  quantity: number;
  unitPrice: number;
  isBishopRate: boolean;
};

/** Group guests into priced lines. Rooms are shared by 2 (§24–26). */
export function computeBookingLines(
  guests: BookingGuestInput[],
  region: Doc<"agcHubs">["region"],
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
    const config = AGC_ACCOMMODATION_TYPES[accommodationType];
    const quantity =
      config.unit === "bed"
        ? guestsInGroup
        : Math.ceil(guestsInGroup / config.maxOccupancy);
    const price = accommodationPrice(accommodationType, region, isBishopRate);
    lines.push({
      accommodationType,
      quantity,
      unitPrice: price.amount,
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
  expiresAt: number;
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
    paymentMode: "offline" | "stripe" | "paypal";
    referenceNumber: string;
  },
): Promise<CreateBookingResult> {
  const { hub, rep, guests } = args;
  if (guests.length === 0) {
    throw new Error("Add at least one guest before booking");
  }

  // Validate every guest before touching inventory.
  for (let i = 0; i < guests.length; i += 1) {
    const error = validateGuestInput(guests[i], i + 1);
    if (error) throw new Error(error);
  }

  const lines = computeBookingLines(guests, hub.region);
  const total = bookingTotal(lines);
  const currency = bookingCurrency(hub.region);
  const expiresAt = await computeHoldExpiry(ctx);

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

export async function releaseBookingInventory(
  ctx: MutationCtx,
  booking: Doc<"agcBookings">,
  action: "release" | "expire" | "cancel",
) {
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
    // Confirmed bookings keep their units consumed — only reserved units return.
    if (booking.bookingStatus === "confirmed") continue;
    await releaseUnits(ctx, pool, line.quantity, booking._id, action);
  }
}

/** Scheduled job: expire reserved bookings whose hold has lapsed (§32–34). */
export async function expireOverdueHolds(ctx: MutationCtx): Promise<number> {
  const now = Date.now();
  const reserved = await ctx.db
    .query("agcBookings")
    .withIndex("by_booking_status", (q) => q.eq("bookingStatus", "reserved"))
    .collect();

  let expired = 0;
  for (const booking of reserved) {
    if (!booking.expiresAt || booking.expiresAt >= now) continue;
    await releaseBookingInventory(ctx, booking, "expire");
    await ctx.db.patch(booking._id, {
      bookingStatus: "expired",
      updatedAt: now,
    });
    expired += 1;
  }
  return expired;
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
  const rows: AvailabilityRow[] = [];
  for (const type of Object.keys(AGC_ACCOMMODATION_TYPES) as AgcAccommodationType[]) {
    const scope: AgcInventoryScope =
      AGC_ACCOMMODATION_TYPES[type].poolScope === "global"
        ? "global"
        : scopeForRegion(region);
    const pool = await loadPoolRead(ctx, type, scope);
    const config = AGC_ACCOMMODATION_TYPES[type];
    rows.push({
      accommodationType: type,
      scope: pool.scope,
      total: pool.total,
      available: availableUnits(pool),
      priceGhs: config.pricing.ghs,
      priceUsd: config.pricing.usd,
      bishopPriceGhs: type === "ebpv" ? AGC_BISHOP_RATE.ghs : config.pricing.ghs,
      bishopPriceUsd: type === "ebpv" ? AGC_BISHOP_RATE.usd : config.pricing.usd,
    });
  }
  return rows;
}
