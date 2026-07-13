import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./users";
import {
  resolveGalleryCover,
  resolveGalleryImages,
} from "./galleryStorage";

export const listFaqs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("faqs").withIndex("by_order").collect();
  },
});

export const listGalleries = query({
  args: {},
  handler: async (ctx) => {
    const galleries = await ctx.db
      .query("galleries")
      .withIndex("by_year")
      .order("desc")
      .collect();

    return Promise.all(
      galleries.map(async (gallery) => {
        const resolved = await resolveGalleryCover(ctx, gallery);
        const images = await resolveGalleryImages(ctx, gallery._id);
        return { ...resolved, images };
      }),
    );
  },
});

export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").withIndex("by_year").order("desc").collect();
  },
});

export const listHomecomingVideos = query({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_year")
      .order("desc")
      .collect();

    return messages
      .filter((message) => message.mediaType === "video")
      .sort((a, b) => a.order - b.order);
  },
});

export const listHotels = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("hotels").withIndex("by_order").collect();
  },
});

export const listStats = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stats").withIndex("by_order").collect();
  },
});

export const listAnnouncements = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("announcements")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
  },
});

export const getAbout = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("aboutContent")
      .withIndex("by_slug", (q) => q.eq("slug", "about"))
      .first();
  },
});

export const upsertFaq = mutation({
  args: {
    id: v.optional(v.id("faqs")),
    category: v.string(),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "editor"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        category: args.category,
        question: args.question,
        answer: args.answer,
        order: args.order,
      });
      return args.id;
    }
    return await ctx.db.insert("faqs", {
      category: args.category,
      question: args.question,
      answer: args.answer,
      order: args.order,
    });
  },
});

export const deleteFaq = mutation({
  args: { id: v.id("faqs") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "editor"]);
    await ctx.db.delete(args.id);
  },
});

export const upsertStat = mutation({
  args: {
    id: v.optional(v.id("stats")),
    label: v.string(),
    value: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "editor"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        label: args.label,
        value: args.value,
        order: args.order,
      });
      return args.id;
    }
    return await ctx.db.insert("stats", {
      label: args.label,
      value: args.value,
      order: args.order,
    });
  },
});

export const upsertAnnouncement = mutation({
  args: {
    id: v.optional(v.id("announcements")),
    title: v.string(),
    body: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "editor"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        title: args.title,
        body: args.body,
        active: args.active,
      });
      return args.id;
    }
    return await ctx.db.insert("announcements", {
      title: args.title,
      body: args.body,
      active: args.active,
      createdAt: Date.now(),
    });
  },
});

export const upsertAbout = mutation({
  args: {
    history: v.string(),
    purpose: v.string(),
    vision: v.string(),
    impact: v.string(),
    firstLadyMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "editor"]);
    const existing = await ctx.db
      .query("aboutContent")
      .withIndex("by_slug", (q) => q.eq("slug", "about"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("aboutContent", {
      slug: "about",
      ...args,
      updatedAt: Date.now(),
    });
  },
});
