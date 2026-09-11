import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { writeAuditLog } from "./lib/audit";
import { requireRole, sessionTokenValidator } from "./users";

type HeroSlideDoc = Doc<"heroSlides">;

async function resolveHeroSlide(
  ctx: QueryCtx | MutationCtx,
  slide: HeroSlideDoc,
) {
  let imageUrl = slide.imageUrl;
  if (slide.storageId) {
    const storageUrl = await ctx.storage.getUrl(slide.storageId);
    if (storageUrl) {
      imageUrl = storageUrl;
    }
  }
  return {
    _id: slide._id,
    alt: slide.alt,
    order: slide.order,
    imageUrl: imageUrl ?? "",
    storageId: slide.storageId,
  };
}

async function listResolvedSlides(ctx: QueryCtx | MutationCtx) {
  const slides = await ctx.db.query("heroSlides").withIndex("by_order").collect();
  slides.sort((a, b) => a.order - b.order);
  return Promise.all(slides.map((slide) => resolveHeroSlide(ctx, slide)));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await listResolvedSlides(ctx);
  },
});

export const listAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    return await listResolvedSlides(ctx);
  },
});

export const add = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    storageId: v.id("_storage"),
    alt: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
    ]);
    const alt = args.alt.trim() || "Homecoming hero image";
    const existing = await ctx.db.query("heroSlides").collect();
    const order =
      existing.length === 0
        ? 0
        : Math.max(...existing.map((slide) => slide.order)) + 1;

    const id = await ctx.db.insert("heroSlides", {
      storageId: args.storageId,
      alt,
      order,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "hero_slide.created",
      entityType: "heroSlides",
      entityId: id,
      summary: `Added hero slide: ${alt}`,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("heroSlides"),
    alt: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Hero slide not found");

    const patch: {
      alt?: string;
      storageId?: Id<"_storage">;
    } = {};

    if (args.alt !== undefined) {
      patch.alt = args.alt.trim() || existing.alt;
    }

    if (args.storageId) {
      if (existing.storageId) {
        await ctx.storage.delete(existing.storageId);
      }
      patch.storageId = args.storageId;
    }

    await ctx.db.patch(args.id, patch);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "hero_slide.updated",
      entityType: "heroSlides",
      entityId: args.id,
      summary: `Updated hero slide: ${patch.alt ?? existing.alt}`,
    });
  },
});

export const remove = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("heroSlides"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Hero slide not found");

    if (existing.storageId) {
      await ctx.storage.delete(existing.storageId);
    }
    await ctx.db.delete(args.id);

    const remaining = await ctx.db
      .query("heroSlides")
      .withIndex("by_order")
      .collect();
    remaining.sort((a, b) => a.order - b.order);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await ctx.db.patch(remaining[i]._id, { order: i });
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "hero_slide.deleted",
      entityType: "heroSlides",
      entityId: args.id,
      summary: `Deleted hero slide: ${existing.alt}`,
    });
  },
});

export const reorder = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    orderedIds: v.array(v.id("heroSlides")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
    ]);
    if (args.orderedIds.length === 0) {
      throw new Error("No slides to reorder");
    }

    for (let i = 0; i < args.orderedIds.length; i++) {
      const id = args.orderedIds[i];
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      if (existing.order !== i) {
        await ctx.db.patch(id, { order: i });
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "hero_slide.reordered",
      entityType: "heroSlides",
      summary: `Reordered ${args.orderedIds.length} hero slides`,
      metadata: { count: args.orderedIds.length },
    });
  },
});

export const seedDefaults = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
    ]);
    const existing = await ctx.db.query("heroSlides").first();
    if (existing) {
      return { seeded: false, reason: "already_exists" as const };
    }

    const defaults = [
      {
        imageUrl: "/gallery/2025/homecoming-14.jpg",
        alt: "Worship and celebration at Homecoming",
      },
      {
        imageUrl: "/gallery/2025/homecoming-17.jpg",
        alt: "The congregation gathered at Homecoming",
      },
      {
        imageUrl: "/gallery/2025/homecoming-19.jpg",
        alt: "A Homecoming convention session",
      },
      {
        imageUrl: "/gallery/2025/homecoming-30.jpg",
        alt: "Moments from Homecoming at Anagkazo Campus",
      },
    ];

    for (let i = 0; i < defaults.length; i++) {
      await ctx.db.insert("heroSlides", {
        imageUrl: defaults[i].imageUrl,
        alt: defaults[i].alt,
        order: i,
      });
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "hero_slide.seeded",
      entityType: "heroSlides",
      summary: `Seeded ${defaults.length} default hero slides`,
      metadata: { count: defaults.length },
    });

    return { seeded: true, count: defaults.length };
  },
});
