import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  DEFAULT_TOUR_PACKAGES,
  slugifyTourLabel,
} from "./lib/tourConfig";
import { writeAuditLog } from "./lib/audit";
import { requireRole, sessionTokenValidator } from "./users";

const packageFields = {
  label: v.string(),
  dateLabel: v.string(),
  timeRange: v.string(),
  sites: v.array(v.string()),
  meals: v.string(),
  priceUsd: v.number(),
  imageUrl: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  clearImageStorage: v.optional(v.boolean()),
  badge: v.optional(v.string()),
  active: v.boolean(),
  order: v.number(),
};

function normalizeSites(sites: string[]) {
  return sites.map((site) => site.trim()).filter(Boolean);
}

function validatePackageInput(args: {
  label: string;
  dateLabel: string;
  timeRange: string;
  sites: string[];
  meals: string;
  priceUsd: number;
  order: number;
}) {
  if (!args.label.trim()) throw new Error("Label is required");
  if (!args.dateLabel.trim()) throw new Error("Date is required");
  if (!args.timeRange.trim()) throw new Error("Time range is required");
  if (!args.meals.trim()) throw new Error("Meals description is required");
  if (!Number.isFinite(args.priceUsd) || args.priceUsd < 0) {
    throw new Error("Price must be a non-negative number");
  }
  if (!Number.isInteger(args.order) || args.order < 0) {
    throw new Error("Order must be a whole number of at least 0");
  }
  const sites = normalizeSites(args.sites);
  if (sites.length === 0) throw new Error("Add at least one site");
  return sites;
}

async function withDisplayImage(
  ctx: QueryCtx | MutationCtx,
  pkg: Doc<"tourPackages">,
) {
  let displayImageUrl = pkg.imageUrl;
  if (pkg.imageStorageId) {
    displayImageUrl =
      (await ctx.storage.getUrl(pkg.imageStorageId)) ?? displayImageUrl;
  }
  return { ...pkg, displayImageUrl };
}

export const generateUploadUrl = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const packages = await ctx.db.query("tourPackages").collect();
    const active = packages
      .filter((pkg) => pkg.active)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    return Promise.all(active.map((pkg) => withDisplayImage(ctx, pkg)));
  },
});

export const listAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    const packages = await ctx.db.query("tourPackages").collect();
    packages.sort(
      (a, b) => a.order - b.order || a.label.localeCompare(b.label),
    );
    return Promise.all(packages.map((pkg) => withDisplayImage(ctx, pkg)));
  },
});

/** Insert missing defaults; backfill image/badge on existing defaults when empty. */
export const ensureDefaults = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    let inserted = 0;
    let patched = 0;
    const now = Date.now();

    for (const pkg of DEFAULT_TOUR_PACKAGES) {
      const existing = await ctx.db
        .query("tourPackages")
        .withIndex("by_slug", (q) => q.eq("slug", pkg.slug))
        .first();

      if (!existing) {
        await ctx.db.insert("tourPackages", {
          slug: pkg.slug,
          label: pkg.label,
          dateLabel: pkg.dateLabel,
          timeRange: pkg.timeRange,
          sites: pkg.sites,
          meals: pkg.meals,
          priceUsd: pkg.priceUsd,
          imageUrl: pkg.imageUrl,
          badge: pkg.badge,
          active: true,
          order: pkg.order,
          updatedAt: now,
        });
        inserted += 1;
        continue;
      }

      const patch: {
        imageUrl?: string;
        badge?: string;
        updatedAt: number;
      } = { updatedAt: now };
      if (!existing.imageUrl && !existing.imageStorageId) {
        patch.imageUrl = pkg.imageUrl;
      }
      if (!existing.badge && pkg.badge) patch.badge = pkg.badge;
      if (patch.imageUrl || patch.badge) {
        await ctx.db.patch(existing._id, patch);
        patched += 1;
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour_packages.ensure_defaults",
      entityType: "tourPackages",
      summary: `Ensured default tour packages (${inserted} inserted, ${patched} patched)`,
      metadata: { inserted, patched },
    });

    return { inserted, patched };
  },
});

export const create = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ...packageFields,
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const sites = validatePackageInput(args);
    const slug = (args.slug?.trim() || slugifyTourLabel(args.label)).toLowerCase();

    const existing = await ctx.db
      .query("tourPackages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing) {
      throw new Error(`A tour package with slug "${slug}" already exists`);
    }

    const imageUrl = args.imageUrl?.trim() || undefined;
    const badge = args.badge?.trim() || undefined;
    const imageStorageId = args.clearImageStorage
      ? undefined
      : args.imageStorageId;

    const id = await ctx.db.insert("tourPackages", {
      slug,
      label: args.label.trim(),
      dateLabel: args.dateLabel.trim(),
      timeRange: args.timeRange.trim(),
      sites,
      meals: args.meals.trim(),
      priceUsd: args.priceUsd,
      imageUrl,
      imageStorageId,
      badge,
      active: args.active,
      order: args.order,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour_packages.create",
      entityType: "tourPackages",
      entityId: id,
      summary: `Created tour package ${args.label.trim()}`,
      metadata: { slug, priceUsd: args.priceUsd },
    });

    return { id };
  },
});

export const update = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("tourPackages"),
    ...packageFields,
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Tour package not found");

    const sites = validatePackageInput(args);
    const imageUrl = args.imageUrl?.trim() || undefined;
    const badge = args.badge?.trim() || undefined;

    let imageStorageId = existing.imageStorageId;
    if (args.clearImageStorage) {
      if (existing.imageStorageId) {
        await ctx.storage.delete(existing.imageStorageId);
      }
      imageStorageId = undefined;
    } else if (args.imageStorageId) {
      if (
        existing.imageStorageId &&
        existing.imageStorageId !== args.imageStorageId
      ) {
        await ctx.storage.delete(existing.imageStorageId);
      }
      imageStorageId = args.imageStorageId;
    }

    await ctx.db.patch(args.id, {
      label: args.label.trim(),
      dateLabel: args.dateLabel.trim(),
      timeRange: args.timeRange.trim(),
      sites,
      meals: args.meals.trim(),
      priceUsd: args.priceUsd,
      imageUrl,
      imageStorageId,
      badge,
      active: args.active,
      order: args.order,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour_packages.update",
      entityType: "tourPackages",
      entityId: args.id,
      summary: `Updated tour package ${args.label.trim()}`,
      metadata: {
        previousPrice: existing.priceUsd,
        nextPrice: args.priceUsd,
        active: args.active,
      },
    });
  },
});

export const remove = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("tourPackages"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Tour package not found");

    if (existing.imageStorageId) {
      await ctx.storage.delete(existing.imageStorageId);
    }

    await ctx.db.delete(args.id);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour_packages.delete",
      entityType: "tourPackages",
      entityId: args.id,
      summary: `Deleted tour package ${existing.label}`,
      metadata: { slug: existing.slug },
    });
  },
});
