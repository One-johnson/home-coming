import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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

export const bulkDeleteFaqs = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("faqs")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.ids.length === 0) {
      throw new Error("Select at least one FAQ");
    }

    let deleted = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.delete(id);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "faq.bulk_deleted",
      entityType: "faqs",
      summary: `Deleted ${deleted} FAQ${deleted === 1 ? "" : "s"}`,
      metadata: { count: deleted },
    });

    return { deleted };
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

const mediaTypeValidator = v.union(
  v.literal("audio"),
  v.literal("video"),
  v.literal("message"),
);

export const upsertMessage = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.optional(v.id("messages")),
    year: v.number(),
    title: v.string(),
    speaker: v.string(),
    mediaType: mediaTypeValidator,
    url: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const url = args.url.trim();
    if (!url) {
      throw new Error("Video URL is required");
    }

    const payload = {
      year: args.year,
      title: args.title.trim(),
      speaker: args.speaker.trim(),
      mediaType: args.mediaType,
      url,
      order: args.order,
      // Clear until the resolver fills YouTube/Rumble thumbnails.
      thumbnailUrl: undefined,
    };

    let messageId = args.id;
    if (args.id) {
      await ctx.db.patch(args.id, payload);
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "message.updated",
        entityType: "messages",
        entityId: args.id,
        summary: `Updated message: ${payload.title}`,
      });
    } else {
      messageId = await ctx.db.insert("messages", payload);
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "message.created",
        entityType: "messages",
        entityId: messageId,
        summary: `Created message: ${payload.title}`,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.mediaThumbnails.resolveMessageThumbnail,
      { messageId: messageId!, url },
    );

    return messageId!;
  },
});

export const bulkCreateMessages = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    items: v.array(
      v.object({
        year: v.number(),
        title: v.string(),
        speaker: v.string(),
        mediaType: mediaTypeValidator,
        url: v.string(),
        order: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.items.length === 0) {
      throw new Error("Add at least one video");
    }

    const messageIds: Id<"messages">[] = [];

    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];
      const url = item.url.trim();
      const title = item.title.trim();
      const speaker = item.speaker.trim();
      if (!url) {
        throw new Error(`Video URL is required (row ${i + 1})`);
      }
      if (!title) {
        throw new Error(`Video title is required (row ${i + 1})`);
      }
      if (!speaker) {
        throw new Error(`Speaker is required (row ${i + 1})`);
      }

      const messageId = await ctx.db.insert("messages", {
        year: item.year,
        title,
        speaker,
        mediaType: item.mediaType,
        url,
        order: item.order,
        thumbnailUrl: undefined,
      });
      messageIds.push(messageId);

      await ctx.scheduler.runAfter(
        0,
        internal.mediaThumbnails.resolveMessageThumbnail,
        { messageId, url },
      );
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "message.bulk_created",
      entityType: "messages",
      summary: `Created ${messageIds.length} messages`,
      metadata: { count: messageIds.length },
    });

    return messageIds;
  },
});

export const deleteMessage = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("messages") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const existing = await ctx.db.get(args.id);
    await ctx.db.delete(args.id);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "message.deleted",
      entityType: "messages",
      entityId: args.id,
      summary: `Deleted message: ${existing?.title ?? args.id}`,
    });
  },
});

export const bulkDeleteMessages = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.ids.length === 0) {
      throw new Error("Select at least one video");
    }

    let deleted = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.delete(id);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "message.bulk_deleted",
      entityType: "messages",
      summary: `Deleted ${deleted} message${deleted === 1 ? "" : "s"}`,
      metadata: { count: deleted },
    });

    return { deleted };
  },
});
