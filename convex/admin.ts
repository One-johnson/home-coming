import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAnyRole, requireRole, sessionTokenValidator } from "./users";

function isPaid(status: string) {
  return status === "paid" || status === "mock_paid";
}

export const getOverview = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const user = await requireAnyRole(ctx, args.sessionToken);

    const canRegistration =
      user.role === "admin" || user.role === "registration";
    const canAccommodation =
      user.role === "admin" || user.role === "accommodation";
    const canContent = user.role === "admin" || user.role === "content";
    const canEmails = user.role === "admin";

    const registrations = canRegistration
      ? await ctx.db.query("registrations").collect()
      : [];
    const bookings = canAccommodation
      ? await ctx.db.query("housingBookings").collect()
      : [];
    const housing = canAccommodation
      ? await ctx.db.query("housing").collect()
      : [];
    const faqs = canContent ? await ctx.db.query("faqs").collect() : [];
    const emailLogs = canEmails
      ? await ctx.db.query("emailLogs").collect()
      : [];

    const paidRegistrations = registrations.filter((r) =>
      isPaid(r.paymentStatus),
    );
    const pendingRegistrations = registrations.filter(
      (r) => r.paymentStatus === "pending_payment",
    );
    const registrationRevenue = paidRegistrations.reduce(
      (sum, r) => sum + r.totalAmount,
      0,
    );

    const paidBookings = bookings.filter((b) => isPaid(b.paymentStatus));
    const pendingBookings = bookings.filter(
      (b) => b.paymentStatus === "pending_payment",
    );
    const bookingRevenue = paidBookings.reduce(
      (sum, b) => sum + b.totalAmount,
      0,
    );

    const regionBreakdown: Record<string, number> = {};
    for (const r of registrations) {
      regionBreakdown[r.region] = (regionBreakdown[r.region] ?? 0) + 1;
    }

    const gatewayBreakdown: Record<string, number> = {};
    for (const r of paidRegistrations) {
      gatewayBreakdown[r.gateway] = (gatewayBreakdown[r.gateway] ?? 0) + 1;
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const start = now - (6 - i) * dayMs;
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + dayMs;
      const count = registrations.filter(
        (r) => r.createdAt >= dayStart.getTime() && r.createdAt < dayEnd,
      ).length;
      return {
        label: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
        count,
      };
    });

    return {
      registrations: {
        total: registrations.length,
        paid: paidRegistrations.length,
        pending: pendingRegistrations.length,
        failed: registrations.filter((r) => r.paymentStatus === "failed")
          .length,
        revenue: registrationRevenue,
        regionBreakdown,
        gatewayBreakdown,
        last7Days,
      },
      bookings: {
        total: bookings.length,
        paid: paidBookings.length,
        pending: pendingBookings.length,
        revenue: bookingRevenue,
      },
      housing: housing.map((h) => ({
        _id: h._id,
        type: h.type,
        capacityLimit: h.capacityLimit,
        booked: h.booked,
        remaining: Math.max(0, h.capacityLimit - h.booked),
        pricePerStay: h.pricePerStay,
      })),
      content: {
        faqs: faqs.length,
      },
      emails: {
        total: emailLogs.length,
        stub: emailLogs.filter((e) => e.status === "stub").length,
        sent: emailLogs.filter((e) => e.status === "sent").length,
        failed: emailLogs.filter((e) => e.status === "failed").length,
      },
    };
  },
});

export const searchQuick = query({
  args: {
    sessionToken: sessionTokenValidator,
    q: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAnyRole(ctx, args.sessionToken);
    const q = args.q.trim().toLowerCase();
    if (q.length < 2) return { registrations: [], bookings: [], pages: [] };

    const pages = [
      { href: "/admin", label: "Overview" },
      { href: "/admin/registrations", label: "Registrations" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/housing", label: "Housing" },
      { href: "/admin/content", label: "Content" },
      { href: "/admin/galleries", label: "Galleries" },
      { href: "/admin/emails", label: "Emails" },
      { href: "/admin/team", label: "Team" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/profile", label: "Profile" },
    ].filter((p) => p.label.toLowerCase().includes(q));

    const canRegistration =
      user.role === "admin" || user.role === "registration";
    const canAccommodation =
      user.role === "admin" || user.role === "accommodation";

    const registrations = canRegistration
      ? (await ctx.db.query("registrations").collect())
          .filter(
            (r) =>
              r.email.toLowerCase().includes(q) ||
              (r.fullName?.toLowerCase().includes(q) ?? false) ||
              (r.referenceNumber?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, 8)
          .map((r) => ({
            _id: r._id,
            label: r.referenceNumber ?? r.email,
            sub: r.email,
          }))
      : [];

    const bookings = canAccommodation
      ? (await ctx.db.query("housingBookings").collect())
          .filter(
            (b) =>
              b.guestEmail.toLowerCase().includes(q) ||
              b.guestName.toLowerCase().includes(q) ||
              (b.referenceNumber?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, 8)
          .map((b) => ({
            _id: b._id,
            label: b.referenceNumber ?? b.guestName,
            sub: b.guestEmail,
          }))
      : [];

    return { registrations, bookings, pages };
  },
});

export const listAuditLogs = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_created_at")
      .order("desc")
      .take(200);
  },
});
