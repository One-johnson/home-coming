import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";

type ImageDoc = Doc<"galleryImages">;
type GalleryDoc = Doc<"galleries">;

/**
 * Curated galleries are served as static repo files under public/gallery
 * (free Vercel CDN) instead of Convex file storage (paid per GB).
 * Image rows therefore carry `imageUrl: "/gallery/<year>/<file>"` with no
 * storageId; receipts, hero, and tour images still live in Convex storage.
 */
const STATIC_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
]);

/**
 * Validates a static gallery file path and returns the canonical URL it is
 * served at: "/gallery/<year>/<slug><ext>". Only the file name is kept
 * (directory components are dropped), the base is slugified, and the
 * extension must be a supported image type. Throws otherwise, so the
 * import-secret-guarded registrar cannot point rows at arbitrary paths.
 *
 * NOTE: mirror of `staticFileName()` in galleryManagerForm.ts — keep in sync.
 */
export function sanitizeStaticGalleryPath(raw: string, year: number) {
  const fileName = raw.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) {
    throw new Error(`Unsupported gallery image name: ${raw}`);
  }
  const ext = fileName.slice(dot).toLowerCase();
  if (!STATIC_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported gallery image type: ${raw}`);
  }
  const base =
    fileName
      .slice(0, dot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "photo";
  return `/gallery/${year}/${base}${ext}`;
}

function assertImportSecret(secret: string) {
  const expected = process.env.IMPORT_SECRET;
  if (!expected || secret !== expected) {
    throw new ConvexError("Unauthorized bulk import");
  }
}

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
    assertImportSecret(args.secret);
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
      throw new ConvexError("Gallery not found");
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
      throw new ConvexError("Image not found");
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
      throw new ConvexError("Gallery not found");
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
    assertImportSecret(args.secret);

    const gallery = await ctx.db
      .query("galleries")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();

    if (!gallery) {
      throw new ConvexError(`No gallery found for year ${args.year}`);
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
    assertImportSecret(args.secret);

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

/**
 * Registers already-deployed static gallery files (public/gallery/<year>/...)
 * as image rows. No bytes are uploaded — rows reference the repo-hosted URL.
 */
export const registerStaticGalleryImages = mutation({
  args: {
    secret: v.string(),
    galleryId: v.id("galleries"),
    images: v.array(
      v.object({
        path: v.string(),
        caption: v.optional(v.string()),
        order: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.secret);

    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      throw new ConvexError("Gallery not found");
    }

    const entries = args.images.map((image) => ({
      ...image,
      imageUrl: sanitizeStaticGalleryPath(image.path, gallery.year),
    }));

    const existing = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", args.galleryId))
      .collect();

    let orderOffset = existing.length;
    const ids = [];

    for (const entry of entries) {
      const order = entry.order ?? orderOffset;
      orderOffset += 1;
      const id = await ctx.db.insert("galleryImages", {
        galleryId: args.galleryId,
        imageUrl: entry.imageUrl,
        caption: entry.caption,
        order,
      });
      ids.push(id);
    }

    if (entries[0]) {
      await ctx.db.patch(args.galleryId, {
        coverImageUrl: entries[0].imageUrl,
        coverStorageId: undefined,
      });
    }

    return ids;
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
    assertImportSecret(args.secret);

    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      throw new ConvexError("Gallery not found");
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
      throw new ConvexError("Image not found");
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
      throw new ConvexError("Select at least one image");
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

/**
 * One-off migration helper (IMPORT_SECRET guarded): point existing
 * Convex-stored gallery images at repo-hosted static files, delete the
 * now-unneeded blobs, and refresh the cover. The caller has already copied
 * the bytes into public/gallery/<year>/.
 */
export const migrateGalleryImagesToStatic = mutation({
  args: {
    secret: v.string(),
    images: v.array(
      v.object({
        imageId: v.id("galleryImages"),
        path: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.secret);

    let migrated = 0;
    let bytesFreed = 0;

    for (const entry of args.images) {
      const image = await ctx.db.get(entry.imageId);
      if (!image) continue;
      const gallery = await ctx.db.get(image.galleryId);
      if (!gallery) continue;

      const imageUrl = sanitizeStaticGalleryPath(entry.path, gallery.year);

      if (image.storageId) {
        const blob = await ctx.db.system.get("_storage", image.storageId);
        if (blob) bytesFreed += blob.size;
        await ctx.storage.delete(image.storageId);

        await ctx.db.patch(image._id, {
          imageUrl,
          storageId: undefined,
        });
        migrated += 1;

        if (gallery.coverStorageId === image.storageId) {
          await ctx.db.patch(gallery._id, {
            coverImageUrl: imageUrl,
            coverStorageId: undefined,
          });
        }
      } else {
        await ctx.db.patch(image._id, { imageUrl });
      }
    }

    return { migrated, bytesFreed };
  },
});

/**
 * Admin action: switch an uploaded (Convex-stored) gallery image over to a
 * repo-hosted static file after committing it under public/gallery/<year>/.
 * Deletes the Convex blob and, if this was the cover, promotes the static
 * path to coverImageUrl.
 */
export const setGalleryImageStaticPath = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("galleryImages"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);

    const image = await ctx.db.get(args.id);
    if (!image) {
      throw new ConvexError("Image not found");
    }
    const gallery = await ctx.db.get(image.galleryId);
    if (!gallery) {
      throw new ConvexError("Gallery not found");
    }

    const imageUrl = sanitizeStaticGalleryPath(args.path, gallery.year);

    if (image.storageId) {
      await ctx.storage.delete(image.storageId);
    }

    await ctx.db.patch(image._id, {
      imageUrl,
      storageId: undefined,
    });

    if (gallery.coverStorageId) {
      await ctx.db.patch(gallery._id, {
        coverImageUrl: imageUrl,
        coverStorageId: undefined,
      });
    }

    return { imageUrl };
  },
});

/**
 * One-off cleanup helper (IMPORT_SECRET guarded): switches a gallery album
 * that still stores its cover in Convex storage over to a repo-hosted static
 * path and deletes the blob. Used after migrating album images to static
 * files so no gallery bytes remain in Convex storage.
 */
export const clearGalleryCoverStorage = mutation({
  args: {
    secret: v.string(),
    year: v.number(),
    coverPath: v.string(),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.secret);

    const gallery = await ctx.db
      .query("galleries")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (!gallery) {
      throw new ConvexError(`No gallery found for year ${args.year}`);
    }
    if (!gallery.coverStorageId) {
      return { cleared: false, reason: "cover already static" };
    }

    const coverImageUrl = sanitizeStaticGalleryPath(
      args.coverPath,
      gallery.year,
    );
    const blobId = gallery.coverStorageId;
    await ctx.db.patch(gallery._id, {
      coverImageUrl,
      coverStorageId: undefined,
    });
    await ctx.storage.delete(blobId);
    return { cleared: true, deletedBlob: blobId, coverImageUrl };
  },
});

/**
 * Import-secret variant of createGallery for tooling: the register-static
 * script auto-creates a missing year album instead of aborting.
 */
export const createStaticGallery = mutation({
  args: { secret: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    assertImportSecret(args.secret);

    const existing = await ctx.db
      .query("galleries")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("galleries", {
      year: args.year,
      theme: "The Homecoming",
      title: `Homecoming ${args.year}`,
    });
  },
});

/**
 * Admin registration of a repo-hosted static image. The client compresses
 * and saves the optimized file itself; this only records the row, so the
 * name must already be the canonical "/gallery/<year>/<file>" path the
 * admin will commit to public/.
 */
export const addStaticGalleryImage = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    galleryId: v.id("galleries"),
    fileName: v.string(),
    caption: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "content"]);

    const gallery = await ctx.db.get(args.galleryId);
    if (!gallery) {
      throw new ConvexError("Gallery not found");
    }

    const imageUrl = sanitizeStaticGalleryPath(args.fileName, gallery.year);

    const existing = await ctx.db
      .query("galleryImages")
      .withIndex("by_gallery", (q) => q.eq("galleryId", args.galleryId))
      .collect();

    const order = args.order ?? existing.length;

    const imageId = await ctx.db.insert("galleryImages", {
      galleryId: args.galleryId,
      imageUrl,
      caption: args.caption,
      order,
    });

    if (!gallery.coverStorageId && !gallery.coverImageUrl) {
      await ctx.db.patch(args.galleryId, { coverImageUrl: imageUrl });
    }

    return imageId;
  },
});
