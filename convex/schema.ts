import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const adminRole = v.union(
  v.literal("admin"),
  v.literal("content"),
  v.literal("registration"),
  v.literal("accommodation"),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: adminRole,
    active: v.optional(v.boolean()),
    disabledAt: v.optional(v.number()),
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
    gateway: v.union(v.literal("paystack"), v.literal("paypal")),
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

  housing: defineTable({
    type: v.union(
      v.literal("condo"),
      v.literal("hostel"),
      v.literal("apartment"),
    ),
    pricePerStay: v.number(),
    capacityLimit: v.number(),
    booked: v.number(),
    notes: v.string(),
  }).index("by_type", ["type"]),

  housingBookings: defineTable({
    housingId: v.id("housing"),
    housingType: v.union(
      v.literal("condo"),
      v.literal("hostel"),
      v.literal("apartment"),
    ),
    guestName: v.string(),
    guestEmail: v.string(),
    guestPhone: v.string(),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    pricePerStay: v.number(),
    totalAmount: v.number(),
    currency: v.literal("USD"),
    paymentStatus: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("mock_paid"),
    ),
    paymentReference: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_housing", ["housingId"])
    .index("by_email", ["guestEmail"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_created_at", ["createdAt"])
    .index("by_reference_number", ["referenceNumber"]),

  tourPackages: defineTable({
    slug: v.string(),
    label: v.string(),
    dateLabel: v.string(),
    timeRange: v.string(),
    sites: v.array(v.string()),
    meals: v.string(),
    priceUsd: v.number(),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    badge: v.optional(v.string()),
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
    gateway: v.union(v.literal("paystack"), v.literal("paypal")),
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
});
