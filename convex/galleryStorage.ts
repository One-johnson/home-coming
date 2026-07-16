import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";

type ImageDoc = Doc<"galleryImages">;
type GalleryDoc = Doc<"galleries">;

export async function resolveImageUrl(
  ctx: QueryCtx | MutationCtx,
  image: ImageDoc,
) {
  if (image.storageId) {
    const storageUrl = await ctx.storage.getUrl(image.storageId);
    if (storageUrl) {
      return { ...image, imageUrl: storageUrl };
    }
  }
  return image;
}

export async function resolveGalleryCover(
  ctx: QueryCtx | MutationCtx,
  gallery: GalleryDoc,
) {
  let coverImageUrl = gallery.coverImageUrl;
  if (gallery.coverStorageId) {
    const storageUrl = await ctx.storage.getUrl(gallery.coverStorageId);
    if (storageUrl) {
      coverImageUrl = storageUrl;
    }
  }
  return { ...gallery, coverImageUrl };
}

export async function resolveGalleryImages(
  ctx: QueryCtx | MutationCtx,
  galleryId: Id<"galleries">,
) {
  const images = await ctx.db
    .query("galleryImages")
    .withIndex("by_gallery", (q) => q.eq("galleryId", galleryId))
    .collect();

  images.sort((a, b) => a.order - b.order);

  return Promise.all(images.map((image) => resolveImageUrl(ctx, image)));
}

export const generateUploadUrl = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    return await ctx.storage.generateUploadUrl();
  },
});

export const generateBulkUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    const expected = process.env.IMPORT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized bulk import");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const createGallery = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    year: v.number(),
    theme: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    return await ctx.db.insert("galleries", {
      year: args.year,
      theme: args.theme,
      title: args.title,
    });
  },
});

export const updateGallery = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("galleries"),
    year: v.number(),
    theme: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Gallery not found");
    }
    await ctx.db.patch(args.id, {
      year: args.year,
      theme: args.theme.trim(),
      title: args.title.trim(),
    });
  },
});

export const updateGalleryImage = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("galleryImages"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    const image = await ctx.db.get(args.id);
    if (!image) {
      throw new Error("Image not found");
    }
    await ctx.db.patch(args.id, {
      caption: args.caption?.trim() || undefined,
    });
  },
});

export const addGalleryImage = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    galleryId: v.id("galleries"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);

    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      throw new Error("Gallery not found");
    }

    const existing = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", args.galleryId))
      .collect();

    const order = args.order ?? existing.length;

    const imageId = await ctx.db.insert("galleryImages", {
      galleryId: args.galleryId,
      storageId: args.storageId,
      caption: args.caption,
      order,
    });

    if (!gallery.coverStorageId && !gallery.coverImageUrl) {
      await ctx.db.patch(args.galleryId, { coverStorageId: args.storageId });
    }

    return imageId;
  },
});

export const clearGalleryForImport = mutation({
  args: {
    secret: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const expected = process.env.IMPORT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized bulk import");
    }

    const gallery = await ctx.db
      .query("galleries")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!gallery) {
      throw new Error(`No gallery found for year ${args.year}`);
    }

    const images = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", gallery._id))
      .collect();

    for (const image of images) {
      if (image.storageId) {
        await ctx.storage.delete(image.storageId);
      }
      await ctx.db.delete(image._id);
    }

    if (gallery.coverStorageId) {
      await ctx.storage.delete(gallery.coverStorageId);
    }

    await ctx.db.patch(gallery._id, {
      coverImageUrl: undefined,
      coverStorageId: undefined,
    });

    return gallery._id;
  },
});

export const deleteGalleryByYearForImport = mutation({
  args: {
    secret: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const expected = process.env.IMPORT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized bulk import");
    }

    const gallery = await ctx.db
      .query("galleries")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!gallery) {
      return null;
    }

    const images = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", gallery._id))
      .collect();

    for (const image of images) {
      if (image.storageId) {
        await ctx.storage.delete(image.storageId);
      }
      await ctx.db.delete(image._id);
    }

    if (gallery.coverStorageId) {
      await ctx.storage.delete(gallery.coverStorageId);
    }

    await ctx.db.delete(gallery._id);
    return gallery._id;
  },
});

export const registerBulkGalleryImages = mutation({
  args: {
    secret: v.string(),
    galleryId: v.id("galleries"),
    images: v.array(
      v.object({
        storageId: v.id("_storage"),
        caption: v.optional(v.string()),
        order: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const expected = process.env.IMPORT_SECRET;
    if (!expected || args.secret !== expected) {
      throw new Error("Unauthorized bulk import");
    }

    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      throw new Error("Gallery not found");
    }

    const existing = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", args.galleryId))
      .collect();

    let orderOffset = existing.length;
    const ids = [];

    for (const image of args.images) {
      const order = image.order ?? orderOffset;
      orderOffset += 1;
      const id = await ctx.db.insert("galleryImages", {
        galleryId: args.galleryId,
        storageId: image.storageId,
        caption: image.caption,
        order,
      });
      ids.push(id);
    }

    if (args.images[0]) {
      await ctx.db.patch(args.galleryId, {
        coverStorageId: args.images[0].storageId,
        coverImageUrl: undefined,
      });
    }

    return ids;
  },
});

export const deleteGalleryImage = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("galleryImages") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);

    const image = await ctx.db.get(args.id);
    if (!image) {
      throw new Error("Image not found");
    }

    if (image.storageId) {
      await ctx.storage.delete(image.storageId);
    }

    await ctx.db.delete(args.id);
  },
});

export const bulkDeleteGalleryImages = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("galleryImages")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);
    if (args.ids.length === 0) {
      throw new Error("Select at least one image");
    }

    let deleted = 0;
    for (const id of args.ids) {
      const image = await ctx.db.get(id);
      if (!image) continue;
      if (image.storageId) {
        await ctx.storage.delete(image.storageId);
      }
      await ctx.db.delete(id);
      deleted += 1;
    }

    return { deleted };
  },
});

export const deleteGallery = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("galleries") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);

    const images = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", args.id))
      .collect();

    for (const image of images) {
      if (image.storageId) {
        await ctx.storage.delete(image.storageId);
      }
      await ctx.db.delete(image._id);
    }

    const gallery = await ctx.db.get(args.id);
    if (gallery?.coverStorageId) {
      await ctx.storage.delete(gallery.coverStorageId);
    }

    await ctx.db.delete(args.id);
  },
});
