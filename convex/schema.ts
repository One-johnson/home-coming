import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  agcAccommodationType,
  agcBookingStatus,
  agcGender,
  agcInventoryScope,
  agcKeyStatus,
  agcOfflineAction,
  agcOfflinePayment,
  agcOfflineSyncStatus,
  agcPaymentMode,
  agcPaymentOverride,
  agcPaymentStatus,
  agcPoaRecord,
  agcRegion,
  agcRoomIssueCategory,
  agcRoomIssueStatus,
} from "./schemaTypes";

export * from "./schemaTypes";

// Phase 2 §2 adds venue staff roles: "room_assignment" (assign/change rooms,
// check in/out, keys) and "checkin" (search, check in/out, keys only).
// "accommodation_volunteer" is the read-only door staff role: they see the
// reps, delegates and rooms directory to point people at their rooms.
const adminRole = v.union(
  v.literal("admin"),
  v.literal("content"),
  v.literal("finance"),
  v.literal("registration"),
  v.literal("accommodation"),
  v.literal("room_assignment"),
  v.literal("checkin"),
  v.literal("accommodation_volunteer"),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: adminRole,
    active: v.optional(v.boolean()),
    disabledAt: v.optional(v.number()),
    /** Phase 2 §2: staff default accommodation location (building), switchable when authorized. */
    defaultLocation: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    actorEmail: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    summary: v.string(),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_entity", ["entityType", "entityId"]),

  registrations: defineTable({
    type: v.union(v.literal("individual"), v.literal("group")),
    fullName: v.optional(v.string()),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    group: v.optional(v.string()),
    denomination: v.optional(v.string()),
    church: v.optional(v.string()),
    ticketQuantity: v.number(),
    // Legacy rows may store string IDs; new rows store { id, quantity }.
    addOns: v.array(
      v.union(
        v.string(),
        v.object({
          id: v.string(),
          quantity: v.number(),
        }),
      ),
    ),
    accommodationInterest: v.boolean(),
    priceAmount: v.number(),
    addOnAmount: v.number(),
    totalAmount: v.number(),
    currency: v.string(),
    gateway: v.union(
      v.literal("stripe"),
      v.literal("paypal"),
      v.literal("offline"),
    ),
    paymentStatus: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("mock_paid"),
    ),
    paymentReference: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    consent: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_created_at", ["createdAt"])
    .index("by_reference_number", ["referenceNumber"]),

  faqs: defineTable({
    category: v.string(),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  heroSlides: defineTable({
    storageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    alt: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  registrationGroups: defineTable({
    name: v.string(),
    price: v.number(),
    currency: v.string(),
    currencySymbol: v.string(),
    gateway: v.union(
      v.literal("stripe"),
      v.literal("paypal"),
      v.literal("offline"),
    ),
    defaultCountryCode: v.string(),
    regionKey: v.union(
      v.literal("ghana"),
      v.literal("west_africa"),
      v.literal("rest_of_africa"),
      v.literal("usa"),
      v.literal("canada"),
      v.literal("switzerland"),
      v.literal("uk"),
      v.literal("rest_of_europe"),
      v.literal("rest_of_world"),
    ),
    order: v.number(),
    active: v.boolean(),
  })
    .index("by_order", ["order"])
    .index("by_name", ["name"]),

  registrationDenominations: defineTable({
    groupId: v.id("registrationGroups"),
    name: v.string(),
    order: v.number(),
    active: v.boolean(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_order", ["groupId", "order"]),

  galleries: defineTable({
    year: v.number(),
    theme: v.string(),
    title: v.string(),
    coverImageUrl: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
  }).index("by_year", ["year"]),

  galleryImages: defineTable({
    galleryId: v.id("galleries"),
    storageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    order: v.number(),
  }).index("by_gallery", ["galleryId"]),

  messages: defineTable({
    year: v.number(),
    title: v.string(),
    speaker: v.string(),
    mediaType: v.union(
      v.literal("audio"),
      v.literal("video"),
      v.literal("message"),
    ),
    url: v.string(),
    thumbnailUrl: v.optional(v.string()),
    order: v.number(),
  }).index("by_year", ["year"]),

  hotels: defineTable({
    name: v.string(),
    contact: v.optional(v.string()),
    rate: v.optional(v.string()),
    distance: v.optional(v.string()),
    instructions: v.optional(v.string()),
    discountCode: v.optional(v.string()),
    order: v.number(),
  }).index("by_order", ["order"]),

  // Deprecated: homepage stats now live in src/content/home.json.
  stats: defineTable({
    label: v.string(),
    value: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_active", ["active"]),

  // Deprecated: about copy now lives in src/content/about.json.
  aboutContent: defineTable({
    slug: v.literal("about"),
    history: v.string(),
    purpose: v.string(),
    vision: v.string(),
    impact: v.string(),
    firstLadyMessage: v.string(),
    firstLadyImageStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  tourPackages: defineTable({
    slug: v.string(),
    label: v.string(),
    dateLabel: v.string(),
    timeRange: v.string(),
    sites: v.array(v.string()),
    meals: v.string(),
    priceUsd: v.number(),
    priceGhs: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    badge: v.optional(v.string()),
    /** Real start time (ms since epoch). `dateLabel` stays the human copy. */
    startsAt: v.optional(v.number()),
    departurePoint: v.optional(v.string()),
    notIncluded: v.optional(v.array(v.string())),
    active: v.boolean(),
    order: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"])
    .index("by_active", ["active"]),


  tourOrders: defineTable({
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    groupName: v.optional(v.string()),
    denomination: v.optional(v.string()),
    church: v.optional(v.string()),
    items: v.array(
      v.object({
        packageId: v.id("tourPackages"),
        label: v.string(),
        quantity: v.number(),
        unitPrice: v.number(),
      }),
    ),
    totalAmount: v.number(),
    currency: v.literal("USD"),
    gateway: v.union(
      v.literal("stripe"),
      v.literal("paypal"),
      v.literal("offline"),
    ),
    paymentStatus: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("mock_paid"),
    ),
    paymentReference: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    /** Payment receipt the guest uploads after booking (image or PDF). */
    receiptStorageId: v.optional(v.id("_storage")),
    receiptUploadedAt: v.optional(v.number()),

    consent: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_created_at", ["createdAt"])
    .index("by_reference_number", ["referenceNumber"]),

  emailLogs: defineTable({
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    htmlBody: v.optional(v.string()),
    type: v.string(),
    referenceId: v.optional(v.string()),
    status: v.union(
      v.literal("stub"),
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created_at", ["createdAt"])
    .index("by_status", ["status"])
    .index("by_type_reference", ["type", "referenceId"]),

  // ----------------------------------------------------------------
  // AGC 2026 representative portal (Phase 1 of the SRS)
  // ----------------------------------------------------------------

  /** Hubs/denominations/countries — the hub name is the rep username (SRS §5). */
  agcHubs: defineTable({
    name: v.string(),
    region: agcRegion,
    country: v.string(),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_region", ["region"]),

  /** Representative accounts. Unique internal id ≠ username (SRS §5). */
  agcRepresentatives: defineTable({
    hubId: v.id("agcHubs"),
    username: v.string(),
    email: v.optional(v.string()),
    passwordHash: v.string(),
    /** Temporary password kept while the account is pending setup; cleared once the rep activates. */
    tempPassword: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    profileComplete: v.boolean(),
    mustChangePassword: v.boolean(),
    status: v.union(
      v.literal("pending_setup"),
      v.literal("active"),
      v.literal("disabled"),
    ),
    /** Soft delete: set when a rep is removed; purged 7 days later. */
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
    /**
     * Usernames this rep previously signed in with. Hub renames rotate the
     * username to follow the new hub name while old usernames keep working.
     */
    previousUsernames: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_username", ["username"])
    .index("by_hub", ["hubId"])
    .index("by_email", ["email"])
    .index("by_deleted_at", ["deletedAt"]),

  agcRepSessions: defineTable({
    repId: v.id("agcRepresentatives"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_rep", ["repId"]),

  /** Login throttle: brute-force lockout for representative sign-in (per username). */
  agcLoginThrottle: defineTable({
    key: v.string(),
    failedCount: v.number(),
    lockedUntil: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  /** Password reset tokens for representatives (SRS §7). */
  agcPasswordResets: defineTable({
    repId: v.id("agcRepresentatives"),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_rep", ["repId"]),

  /** Password reset tokens for platform-admin accounts (mirrors agcPasswordResets). */
  adminPasswordResets: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  /** Configurable system settings (SRS §55) — one row per key. */
  agcSettings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  /** Bulk registration purchases — attendee names are NOT captured (SRS §9). */
  agcRegistrations: defineTable({
    hubId: v.id("agcHubs"),
    repId: v.id("agcRepresentatives"),
    region: agcRegion,
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    quantity: v.number(),
    unitPrice: v.number(),
    currency: v.string(),
    totalAmount: v.number(),
    paymentMode: agcPaymentMode,
    paymentStatus: agcPaymentStatus,
    paymentReference: v.optional(v.string()),
    offline: v.optional(agcOfflinePayment),
    adminMessage: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    referenceNumber: v.optional(v.string()),
    /** Payment-on-arrival lifecycle (IOU) — present only for POA records. */
    poa: v.optional(agcPoaRecord),
    /** Soft delete: set when removed; purged 30 days later. */
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hub", ["hubId"])
    .index("by_rep", ["repId"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_created_at", ["createdAt"])
    .index("by_reference_number", ["referenceNumber"])
    .index("by_deleted_at", ["deletedAt"]),

  /** Accommodation transaction (SRS §22, §38, §49). */
  agcBookings: defineTable({
    hubId: v.id("agcHubs"),
    repId: v.id("agcRepresentatives"),
    region: agcRegion,
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    currency: v.string(),
    totalAmount: v.number(),
    paymentMode: agcPaymentMode,
    paymentStatus: agcPaymentStatus,
    bookingStatus: agcBookingStatus,
    paymentReference: v.optional(v.string()),
    offline: v.optional(agcOfflinePayment),
    adminMessage: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    referenceNumber: v.optional(v.string()),
    /** Payment-on-arrival lifecycle (IOU) — present only for POA records. */
    poa: v.optional(agcPoaRecord),
    /** Soft delete: set when removed; purged 30 days later. */
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hub", ["hubId"])
    .index("by_rep", ["repId"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_booking_status", ["bookingStatus"])
    .index("by_expires_at", ["expiresAt"])
    .index("by_created_at", ["createdAt"])
    .index("by_reference_number", ["referenceNumber"])
    .index("by_deleted_at", ["deletedAt"]),

  /** Named guests attached to a booking (SRS §37). */
  agcGuests: defineTable({
    bookingId: v.id("agcBookings"),
    hubId: v.id("agcHubs"),
    region: agcRegion,
    country: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    gender: agcGender,
    title: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    accommodationType: agcAccommodationType,
    pool: agcInventoryScope,
    isBishopRate: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("replaced"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_hub", ["hubId"])
    .index("by_type_gender_status", [
      "accommodationType",
      "gender",
      "status",
    ]),

  /** Per-line pricing snapshot for a booking (SRS §38). */
  agcBookingLines: defineTable({
    bookingId: v.id("agcBookings"),
    accommodationType: agcAccommodationType,
    quantity: v.number(),
    unitPrice: v.number(),
    isBishopRate: v.boolean(),
  }).index("by_booking", ["bookingId"]),

  /** Substitution history — never overwrite original data (SRS §43). */
  agcSubstitutions: defineTable({
    bookingId: v.id("agcBookings"),
    guestId: v.id("agcGuests"),
    previousFirstName: v.string(),
    previousLastName: v.string(),
    previousGender: agcGender,
    previousType: agcAccommodationType,
    newFirstName: v.string(),
    newLastName: v.string(),
    newGender: agcGender,
    newType: agcAccommodationType,
    overrideByAdmin: v.boolean(),
    actorRepId: v.optional(v.id("agcRepresentatives")),
    actorAdminEmail: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_guest", ["guestId"]).index("by_booking", ["bookingId"]),

  /** Regional/global inventory pools (SRS §28). */
  agcInventoryPools: defineTable({
    accommodationType: agcAccommodationType,
    scope: agcInventoryScope,
    total: v.number(),
    reserved: v.number(),
    confirmed: v.number(),
  })
    .index("by_type_scope", ["accommodationType", "scope"])
    .index("by_scope", ["scope"]),

  /** Every inventory movement — audit + real-time availability (SRS §29, §31). */
  agcInventoryLedger: defineTable({
    poolId: v.id("agcInventoryPools"),
    accommodationType: agcAccommodationType,
    scope: agcInventoryScope,
    action: v.union(
      v.literal("reserve"),
      v.literal("release"),
      v.literal("confirm"),
      v.literal("expire"),
      v.literal("cancel"),
      v.literal("reallocate"),
      /** Counter self-heal: the stored counters were rewritten to match. */
      v.literal("reconcile"),
    ),
    delta: v.number(),
    bookingId: v.optional(v.id("agcBookings")),
    actorEmail: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_pool", ["poolId"])
    .index("by_booking", ["bookingId"])
    .index("by_created_at", ["createdAt"]),

  /** Pool reallocation history (SRS §29). */
  agcReallocations: defineTable({
    accommodationType: agcAccommodationType,
    fromScope: agcInventoryScope,
    toScope: agcInventoryScope,
    quantity: v.number(),
    actorEmail: v.string(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  /** Physical room within an accommodation type (room-assignment workflow). */
  agcRooms: defineTable({
    accommodationType: agcAccommodationType,
    name: v.string(),
    /** Block/building within the location (Phase 2 §3, e.g. "Blocks 1–4"). */
    building: v.optional(v.string()),
    gender: v.optional(agcGender),
    capacity: v.number(),
    note: v.optional(v.string()),
    /** Phase 2 §8: null/unset = Unpublished; set when reps may see it. */
    publishedAt: v.optional(v.number()),
    publishedBy: v.optional(v.string()),
    /**
     * Desk reservation: the room is spoken for and must not be assigned until
     * it is released. Set by the room team, with the reason kept on the room.
     */
    hold: v.optional(
      v.object({ note: v.string(), by: v.string(), at: v.number() }),
    ),
    deletedAt: v.optional(v.number()),
  }).index("by_type", ["accommodationType"]),

  /**
   * Maintenance flag on a physical room — "the toilet is broken". One row per
   * problem, so a room can carry several; fixing keeps the record for history.
   */
  agcRoomIssues: defineTable({
    roomId: v.id("agcRooms"),
    /** Snapshot so the flag still reads correctly if the room is renamed. */
    roomName: v.string(),
    accommodationType: agcAccommodationType,
    building: v.optional(v.string()),
    category: agcRoomIssueCategory,
    /** What exactly is wrong — required, shown on the room card. */
    note: v.string(),
    /**
     * Whether this problem takes the room out of inventory while it is open.
     * A blocked room is not offered for assignment and counts as faulty; it
     * comes back automatically when every blocking flag is fixed.
     */
    blocksRoom: v.optional(v.boolean()),
    status: agcRoomIssueStatus,
    reportedAt: v.number(),
    reportedBy: v.string(),
    reportedByRole: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_status", ["status"])
    .index("by_reported_at", ["reportedAt"]),

  /** Per-room key record — WSL / Good General / EBPV (Phase 2 §14–15). */
  agcKeys: defineTable({
    roomId: v.id("agcRooms"),
    accommodationType: agcAccommodationType,
    roomName: v.string(),
    /** Recipient guest + label at the time of issuance. */
    recipientGuestId: v.optional(v.id("agcGuests")),
    recipientName: v.optional(v.string()),
    status: agcKeyStatus,
    issuedAt: v.optional(v.number()),
    issuedBy: v.optional(v.string()),
    replacedAt: v.optional(v.number()),
    replacedBy: v.optional(v.string()),
    newRecipientName: v.optional(v.string()),
    returnedAt: v.optional(v.number()),
    returnedBy: v.optional(v.string()),
    note: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_room", ["roomId"]),

  /**
   * Accommodation check-in (Phase 2 §10–18). One row per guest check-in;
   * duplicate check-ins are prevented by the by_guest index lookup.
   */
  agcCheckIns: defineTable({
    guestId: v.id("agcGuests"),
    bookingId: v.id("agcBookings"),
    hubId: v.id("agcHubs"),
    roomId: v.id("agcRooms"),
    /** Room name/building snapshot at check-in time (rooms can be renamed). */
    roomName: v.string(),
    building: v.optional(v.string()),
    /** "central" or the building name of the desk that processed it. */
    location: v.string(),
    checkedInAt: v.number(),
    checkedInBy: v.string(),
    checkedInByRole: v.optional(v.string()),
    /** Station transaction id when this came from the offline queue (§19). */
    offlineTxId: v.optional(v.string()),
    /** §18: payment override — Accommodation Admin only. */
    paymentOverride: v.optional(agcPaymentOverride),
    // Optional check-out (§20).
    checkedOutAt: v.optional(v.number()),
    checkedOutBy: v.optional(v.string()),
    keyReturnStatus: v.optional(v.union(
      v.literal("returned"),
      v.literal("not_returned"),
      v.literal("not_applicable"),
    )),
    // §16: correction of an erroneous check-in — never silently deleted.
    correctedAt: v.optional(v.number()),
    correctedBy: v.optional(v.string()),
    correctionReason: v.optional(v.string()),
  })
    .index("by_guest", ["guestId"])
    .index("by_room", ["roomId"])
    .index("by_checked_in_at", ["checkedInAt"]),

  /**
   * A desk-raised "review this record" flag on a delegate's arrival record.
   * Any check-in role may raise one; the note is the reason and is required.
   * An Accommodation Admin clears it with a review note — the row is kept, so
   * the flag stays in the audit trail after it is closed.
   */
  agcCheckinFlags: defineTable({
    guestId: v.id("agcGuests"),
    bookingId: v.id("agcBookings"),
    /** Snapshot of the room the record sat in when it was flagged. */
    roomId: v.optional(v.id("agcRooms")),
    roomName: v.optional(v.string()),
    checkInId: v.optional(v.id("agcCheckIns")),
    /** Required reason the record needs a second look. */
    note: v.string(),
    raisedAt: v.number(),
    raisedBy: v.string(),
    raisedByRole: v.optional(v.string()),
    /**
     * §18 payment override pre-authorized by the reviewer from the queue. The
     * desk then checks the delegate in on those terms, and the authorization
     * is what the check-in records as the override.
     */
    override: v.optional(agcPaymentOverride),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index("by_guest", ["guestId"])
    .index("by_raised_at", ["raisedAt"]),

  /** Designated offline station per building (Phase 2 §19) — one per building. */
  agcOfflineStations: defineTable({
    building: v.string(),
    stationName: v.string(),
    registeredBy: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_building", ["building"]),

  /** Offline transaction queue entry (Phase 2 §19). */
  agcOfflineTransactions: defineTable({
    /** Client-generated UUID — dedupe on replay. */
    txId: v.string(),
    staffId: v.string(),
    staffRole: v.optional(v.string()),
    building: v.string(),
    action: agcOfflineAction,
    /** JSON payload of the action's mutation args. */
    payload: v.string(),
    originalAt: v.number(),
    syncStatus: agcOfflineSyncStatus,
    syncedAt: v.optional(v.number()),
    conflictReason: v.optional(v.string()),
    /** Set when a reviewer closes the transaction (applied or rejected). */
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_tx", ["txId"])
    .index("by_sync_status", ["syncStatus"]),

  /** Hubs allowed to register/book with "payment on arrival" (IOU) terms. */
  agcPoaHubs: defineTable({
    hubId: v.id("agcHubs"),
    note: v.optional(v.string()),
    assignedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_hub", ["hubId"]),

  /**
   * A guest in a room — one open row per occupied bed. Append-only: room
   * changes close the row (endedAt) instead of deleting it, preserving the
   * full assignment history (Phase 2 §9).
   */
  agcRoomAssignments: defineTable({
    roomId: v.id("agcRooms"),
    guestId: v.id("agcGuests"),
    bookingId: v.id("agcBookings"),
    assignedBy: v.optional(v.string()),
    createdAt: v.number(),
    /** Set when the guest was moved/removed — the row is kept forever. */
    endedAt: v.optional(v.number()),
    endReason: v.optional(v.string()),
    replacedByAssignmentId: v.optional(v.id("agcRoomAssignments")),
    endBy: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_guest", ["guestId"])
    .index("by_booking", ["bookingId"]),
});
