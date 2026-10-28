import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
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
    const canContent = user.role === "admin" || user.role === "content";
    const canEmails = user.role === "admin";

    const registrations = canRegistration
      ? await ctx.db.query("registrations").collect()
      : [];
    // Badge for the AGC accommodation review page (pending payment checks).
    const agcPendingBookings =
      user.role === "admin" || user.role === "accommodation"
        ? (
            await ctx.db
              .query("agcBookings")
              .withIndex("by_payment_status", (q) =>
                q.eq("paymentStatus", "pending_verification"),
              )
              .collect()
          ).length
        : 0;
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
    if (canEmails) {
      const failedEmails = emailLogs.filter((e) => e.status === "failed").length;
      // Only true SMTP queue pending — stubs mean delivery is intentionally skipped.
      const pendingEmails = emailLogs.filter(
        (e) => e.status === "pending",
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
      content: {
        faqs: faqs.length,
        videos: messages.length,
      },
      emails: {
        total: emailLogs.length,
        pending: emailLogs.filter((e) => e.status === "pending").length,
        stub: emailLogs.filter((e) => e.status === "stub").length,
        sent: emailLogs.filter((e) => e.status === "sent").length,
        failed: emailLogs.filter((e) => e.status === "failed").length,
      },
      attention,
      recentActivity,
      badges: {
        registrationsPending: pendingRegistrations.length,
        bookingsPending: agcPendingBookings,
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
      { href: "/admin/accommodation", label: "Accommodation" },
      { href: "/admin/tours", label: "Tours" },
      { href: "/admin/hotels", label: "Hotels" },
      { href: "/admin/content", label: "Content" },
      { href: "/admin/hero", label: "Hero" },
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

    // AGC registrations: match reference number or hub contact email.
    const registrations = canRegistration
      ? (await ctx.db.query("agcRegistrations").collect())
          .filter(
            (r) =>
              (r.referenceNumber?.toLowerCase().includes(q) ?? false) ||
              (r.contactEmail?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, 8)
          .map((r) => ({
            _id: r._id,
            label: r.referenceNumber ?? "(pending)",
            sub: r.contactEmail ?? `Hub registration · ${r.quantity} delegate(s)`,
          }))
      : [];

    // AGC bookings: match reference number or hub contact email.
    const bookings = canAccommodation
      ? (await ctx.db.query("agcBookings").collect())
          .filter(
            (b) =>
              (b.referenceNumber?.toLowerCase().includes(q) ?? false) ||
              (b.contactEmail?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, 8)
          .map((b) => ({
            _id: b._id,
            label: b.referenceNumber ?? "(pending)",
            sub: b.contactEmail ?? `Booking · ${b.paymentStatus}`,
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

/**
 * Delegate corrections made in the console, newest first — what the accommodation
 * team (and the super admins) changed on a live reservation while the rep could
 * no longer touch it, with the details each change replaced and the reason that
 * was given.
 *
 * This is the substitution history read from the staff side: a correction made
 * from the desk, the review queue or the bookings list is the one that altered a
 * delegate's identity on a locked booking, so those are the rows that carry an
 * acting staff member. A rep substituting a delegate while the booking is still
 * theirs to change is recorded on the booking itself and needs no review here,
 * so rows with no staff actor are left out.
 */
export const listDelegateCorrections = query({
  args: {
    sessionToken: sessionTokenValidator,
    limit: v.optional(v.number()),
    /** Only corrections made by this staff account (case-insensitive email). */
    actorEmail: v.optional(v.string()),
    /** Only corrections made by staff in this role (e.g. "accommodation"). */
    actorRole: v.optional(v.string()),
    /** Inclusive epoch-ms bounds on when the correction was made. */
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);

    const all = (await ctx.db.query("agcSubstitutions").collect()).filter(
      (row): row is typeof row & { actorAdminEmail: string } =>
        row.actorAdminEmail !== undefined,
    );

    // Which team made the change is the point of the screen, and the role is not
    // denormalised onto the row, so it is resolved from the acting account. The
    // staff list is small and the correction set is small; a null role means the
    // account has since been removed.
    const roleByEmail = new Map(
      (await ctx.db.query("users").collect()).map((user) => [
        user.email.toLowerCase(),
        user.role as string,
      ]),
    );

    // The filter offers the people who have actually corrected a delegate, with
    // how many each of them made, rather than a fixed list of staff accounts.
    const actorByEmail = new Map<string, { email: string; count: number }>();
    for (const row of all) {
      const key = row.actorAdminEmail.toLowerCase();
      const existing = actorByEmail.get(key);
      if (existing) existing.count += 1;
      else actorByEmail.set(key, { email: row.actorAdminEmail, count: 1 });
    }
    const actors = [...actorByEmail.entries()]
      .map(([key, actor]) => ({
        email: actor.email,
        count: actor.count,
        role: roleByEmail.get(key) ?? null,
      }))
      .sort(
        (a, b) => b.count - a.count || a.email.localeCompare(b.email),
      );

    // The team view is the same set counted by role, so a super admin can ask
    // "what did Accommodation change?" without knowing who works there. Staff
    // whose account has since been removed have no team to belong to and are
    // left out of this list (their corrections still show under Anyone).
    const countByRole = new Map<string, number>();
    for (const row of all) {
      const role = roleByEmail.get(row.actorAdminEmail.toLowerCase());
      if (!role) continue;
      countByRole.set(role, (countByRole.get(role) ?? 0) + 1);
    }
    const teams = [...countByRole.entries()]
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));

    const wanted = args.actorEmail?.trim().toLowerCase();
    const wantedRole = args.actorRole?.trim();
    const filtered = all
      .filter((row) => !wanted || row.actorAdminEmail.toLowerCase() === wanted)
      .filter(
        (row) =>
          !wantedRole ||
          roleByEmail.get(row.actorAdminEmail.toLowerCase()) === wantedRole,
      )
      .filter((row) => args.from === undefined || row.createdAt >= args.from)
      .filter((row) => args.to === undefined || row.createdAt <= args.to)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, args.limit ?? 100);

    const bookingById = new Map(
      (await ctx.db.query("agcBookings").collect()).map((b) => [b._id, b]),
    );

    return {
      /** Every console correction, before the filters — what the panel counts against. */
      total: all.length,
      actors,
      teams,
      rows: filtered.map((row) => ({
        _id: row._id,
        createdAt: row.createdAt,
        previousFirstName: row.previousFirstName,
        previousLastName: row.previousLastName,
        previousGender: row.previousGender as string,
        newFirstName: row.newFirstName,
        newLastName: row.newLastName,
        newGender: row.newGender as string,
        reason: row.reason ?? null,
        actorEmail: row.actorAdminEmail,
        actorRole: roleByEmail.get(row.actorAdminEmail.toLowerCase()) ?? null,
        bookingRef: bookingById.get(row.bookingId)?.referenceNumber ?? null,
      })),
    };
  },
});

export const removeAuditLog = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("auditLogs") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError("Audit log not found");
    await ctx.db.delete(args.id);
  },
});

export const bulkRemoveAuditLogs = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("auditLogs")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    let deleted = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.delete(id);
      deleted += 1;
    }
    return { deleted };
  },
});
