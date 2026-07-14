import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";
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

export const listAnnouncementsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    return await ctx.db.query("announcements").collect();
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
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("faqs")),
    category: v.string(),
    question: v.string(),
    answer: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        category: args.category,
        question: args.question,
        answer: args.answer,
        order: args.order,
      });
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "faq.updated",
        entityType: "faqs",
        entityId: args.id,
        summary: `Updated FAQ: ${args.question}`,
      });
      return args.id;
    }
    const id = await ctx.db.insert("faqs", {
      category: args.category,
      question: args.question,
      answer: args.answer,
      order: args.order,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "faq.created",
      entityType: "faqs",
      entityId: id,
      summary: `Created FAQ: ${args.question}`,
    });
    return id;
  },
});

export const deleteFaq = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("faqs") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "faq.deleted",
      entityType: "faqs",
      entityId: args.id,
      summary: `Deleted FAQ: ${existing?.question ?? args.id}`,
    });
  },
});

export const upsertStat = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("stats")),
    label: v.string(),
    value: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        label: args.label,
        value: args.value,
        order: args.order,
      });
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "stat.updated",
        entityType: "stats",
        entityId: args.id,
        summary: `Updated stat: ${args.label}`,
      });
      return args.id;
    }
    const id = await ctx.db.insert("stats", {
      label: args.label,
      value: args.value,
      order: args.order,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "stat.created",
      entityType: "stats",
      entityId: id,
      summary: `Created stat: ${args.label}`,
    });
    return id;
  },
});

export const deleteStat = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("stats") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "stat.deleted",
      entityType: "stats",
      entityId: args.id,
      summary: `Deleted stat: ${existing?.label ?? args.id}`,
    });
  },
});

export const upsertAnnouncement = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("announcements")),
    title: v.string(),
    body: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.id) {
      await ctx.db.patch(args.id, {
        title: args.title,
        body: args.body,
        active: args.active,
      });
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "announcement.updated",
        entityType: "announcements",
        entityId: args.id,
        summary: `Updated announcement: ${args.title}`,
      });
      return args.id;
    }
    const id = await ctx.db.insert("announcements", {
      title: args.title,
      body: args.body,
      active: args.active,
      createdAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "announcement.created",
      entityType: "announcements",
      entityId: id,
      summary: `Created announcement: ${args.title}`,
    });
    return id;
  },
});

export const deleteAnnouncement = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("announcements") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "announcement.deleted",
      entityType: "announcements",
      entityId: args.id,
      summary: `Deleted announcement: ${existing?.title ?? args.id}`,
    });
  },
});

export const upsertAbout = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    history: v.string(),
    purpose: v.string(),
    vision: v.string(),
    impact: v.string(),
    firstLadyMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const content = {
      history: args.history,
      purpose: args.purpose,
      vision: args.vision,
      impact: args.impact,
      firstLadyMessage: args.firstLadyMessage,
      updatedAt: Date.now(),
    };
    const existing = await ctx.db
      .query("aboutContent")
      .withIndex("by_slug", (q) => q.eq("slug", "about"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, content);
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "about.updated",
        entityType: "aboutContent",
        entityId: existing._id,
        summary: "Updated about page content",
      });
      return existing._id;
    }

    const id = await ctx.db.insert("aboutContent", {
      slug: "about",
      ...content,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "about.created",
      entityType: "aboutContent",
      entityId: id,
      summary: "Created about page content",
    });
    return id;
  },
});
