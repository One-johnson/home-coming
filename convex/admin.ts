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
    const messages = canContent ? await ctx.db.query("messages").collect() : [];
    const emailLogs = canEmails
      ? await ctx.db.query("emailLogs").collect()
      : [];
    const recentActivity =
      user.role === "admin"
        ? (
            await ctx.db
              .query("auditLogs")
              .withIndex("by_created_at")
              .order("desc")
              .take(8)
          ).map((log) => ({
            _id: log._id,
            action: log.action,
            summary: log.summary,
            actorEmail: log.actorEmail,
            createdAt: log.createdAt,
          }))
        : [];

    const paidRegistrations = registrations.filter((r) =>
      isPaid(r.paymentStatus),
    );
    const pendingRegistrations = registrations.filter(
      (r) => r.paymentStatus === "pending_payment",
    );
    const failedRegistrations = registrations.filter(
      (r) => r.paymentStatus === "failed",
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
    const weekMs = 7 * dayMs;
    const thisWeekStart = now - weekMs;
    const lastWeekStart = now - 2 * weekMs;
    const registrationsThisWeek = registrations.filter(
      (r) => r.createdAt >= thisWeekStart,
    ).length;
    const registrationsLastWeek = registrations.filter(
      (r) => r.createdAt >= lastWeekStart && r.createdAt < thisWeekStart,
    ).length;
    const bookingsThisWeek = bookings.filter(
      (b) => b.createdAt >= thisWeekStart,
    ).length;

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

    const lowHousing = housing.filter(
      (h) => h.capacityLimit > 0 && h.capacityLimit - h.booked <= 5,
    );

    const attention: {
      id: string;
      label: string;
      detail: string;
      href: string;
      tone: "warn" | "danger" | "info";
    }[] = [];

    if (canRegistration && pendingRegistrations.length > 0) {
      attention.push({
        id: "reg-pending",
        label: "Pending registrations",
        detail: `${pendingRegistrations.length} awaiting payment review`,
        href: "/admin/registrations",
        tone: "warn",
      });
    }
    if (canRegistration && failedRegistrations.length > 0) {
      attention.push({
        id: "reg-failed",
        label: "Failed payments",
        detail: `${failedRegistrations.length} registration payment${failedRegistrations.length === 1 ? "" : "s"} failed`,
        href: "/admin/registrations",
        tone: "danger",
      });
    }
    if (canAccommodation && pendingBookings.length > 0) {
      attention.push({
        id: "booking-pending",
        label: "Pending bookings",
        detail: `${pendingBookings.length} housing booking${pendingBookings.length === 1 ? "" : "s"} unpaid`,
        href: "/admin/bookings",
        tone: "warn",
      });
    }
    if (canAccommodation && lowHousing.length > 0) {
      attention.push({
        id: "housing-low",
        label: "Low housing capacity",
        detail: lowHousing
          .map((h) => `${h.type}: ${Math.max(0, h.capacityLimit - h.booked)} left`)
          .join(" · "),
        href: "/admin/housing",
        tone: "info",
      });
    }
    if (canEmails) {
      const failedEmails = emailLogs.filter((e) => e.status === "failed").length;
      const pendingEmails = emailLogs.filter(
        (e) => e.status === "pending" || e.status === "stub",
      ).length;
      if (failedEmails > 0) {
        attention.push({
          id: "email-failed",
          label: "Failed emails",
          detail: `${failedEmails} email${failedEmails === 1 ? "" : "s"} failed to send`,
          href: "/admin/emails",
          tone: "danger",
        });
      } else if (pendingEmails > 0) {
        attention.push({
          id: "email-pending",
          label: "Pending emails",
          detail: `${pendingEmails} email${pendingEmails === 1 ? "" : "s"} awaiting delivery`,
          href: "/admin/emails",
          tone: "info",
        });
      }
    }

    return {
      registrations: {
        total: registrations.length,
        paid: paidRegistrations.length,
        pending: pendingRegistrations.length,
        failed: failedRegistrations.length,
        revenue: registrationRevenue,
        thisWeek: registrationsThisWeek,
        lastWeek: registrationsLastWeek,
        regionBreakdown,
        gatewayBreakdown,
        last7Days,
      },
      bookings: {
        total: bookings.length,
        paid: paidBookings.length,
        pending: pendingBookings.length,
        revenue: bookingRevenue,
        thisWeek: bookingsThisWeek,
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
        videos: messages.length,
      },
      emails: {
        total: emailLogs.length,
        pending: emailLogs.filter(
          (e) => e.status === "pending" || e.status === "stub",
        ).length,
        sent: emailLogs.filter((e) => e.status === "sent").length,
        failed: emailLogs.filter((e) => e.status === "failed").length,
      },
      attention,
      recentActivity,
      badges: {
        registrationsPending: pendingRegistrations.length,
        bookingsPending: pendingBookings.length,
        emailsFailed: emailLogs.filter((e) => e.status === "failed").length,
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
      { href: "/admin/videos", label: "Videos" },
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
