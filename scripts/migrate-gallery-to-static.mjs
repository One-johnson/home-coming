#!/usr/bin/env node
/**
 * One-off migration: move curated gallery photos from Convex file storage
 * to repo-hosted static files under public/gallery/<year>/.
 *
 * For every gallery image row that still has a storageId this script:
 *   1. downloads the blob from Convex storage,
 *   2. saves it to public/gallery/<year>/<canonical-name>,
 *   3. calls migrateGalleryImagesToStatic to patch the row to imageUrl and
 *      delete the blob,
 *   4. prints a summary of bytes freed.
 *
 * After running, review the new files (they are the exact optimized bytes
 * that were stored), commit them, and deploy. Covers follow automatically.
 *
 * Usage: node scripts/migrate-gallery-to-static.mjs [--year 2025] [--dry-run]
 * Requires NEXT_PUBLIC_CONVEX_URL + IMPORT_SECRET in .env.local and in the
 * Convex dashboard.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public", "gallery");

const dryRun = process.argv.includes("--dry-run");
const yearIdx = process.argv.indexOf("--year");
const onlyYear = yearIdx !== -1 ? Number(process.argv[yearIdx + 1]) : null;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(ROOT, ".env.local"));

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const IMPORT_SECRET = process.env.IMPORT_SECRET;

if (!CONVEX_URL || !IMPORT_SECRET) {
  console.error(
    "Missing NEXT_PUBLIC_CONVEX_URL or IMPORT_SECRET in .env.local (and set IMPORT_SECRET in the Convex dashboard).",
  );
  process.exit(1);
}

/** Same canonical slug rule as sanitizeStaticGalleryPath — keep in sync. */
function baseName(raw) {
  const dot = raw.lastIndexOf(".");
  const base =
    (dot > 0 ? raw.slice(0, dot) : raw)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "photo";
  return base;
}

const EXT_BY_CONTENT_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  const galleries = await client.query(api.content.listGalleries, {});
  const targets = galleries.filter(
    (g) => onlyYear === null || g.year === onlyYear,
  );

  let totalBytes = 0;
  let migrated = 0;
  const ops = [];

  for (const gallery of targets) {
    for (const image of gallery.images) {
      if (!image.storageId) continue;

      const sourceUrl = image.imageUrl;
      if (!sourceUrl) {
        console.warn(
          `Skipping image ${image._id}: no resolved URL (blob missing?)`,
        );
        continue;
      }

      // Convex storage URLs carry no file extension, so the canonical name
      // falls back to the blob's content-type (fetched during download).
      const base = baseName(
        image.caption || `gallery-image-${image.order}`,
      );
      ops.push({
        gallery,
        image,
        sourceUrl,
        base,
        dest: null,
        fileName: null,
      });
    }
  }

  if (!ops.length) {
    console.log("Nothing to migrate — all gallery images already static.");
    process.exit(0);
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}Migrating ${ops.length} image(s) to public/gallery/...\n`,
  );

  for (const op of ops) {
    fs.mkdirSync(path.dirname(op.dest || path.join(PUBLIC_DIR, String(op.gallery.year))), { recursive: true });

    const response = await fetch(op.sourceUrl);
    if (!response.ok) {
      console.error(`  ✗ ${op.sourceUrl}: HTTP ${response.status}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = EXT_BY_CONTENT_TYPE[contentType];
    if (!ext) {
      console.error(
        `  ✗ ${op.image._id}: unrecognized content-type "${contentType}"`,
      );
      continue;
    }
    op.fileName = `${op.base}${ext}`;
    op.dest = path.join(PUBLIC_DIR, String(op.gallery.year), op.fileName);

    if (!dryRun) {
      fs.writeFileSync(op.dest, buffer);
    }

    console.log(
      `  ✓ /gallery/${op.gallery.year}/${op.fileName} (${(buffer.length / 1024).toFixed(0)} KB)`,
    );

    totalBytes += buffer.length;
    migrated += 1;
  }

  if (!dryRun) {
    const result = await client.mutation(
      api.galleryStorage.migrateGalleryImagesToStatic,
      {
        secret: IMPORT_SECRET,
        images: ops.map((op) => ({
          imageId: op.image._id,
          path: op.fileName,
        })),
      },
    );
    console.log(
      `\nPatched ${result.migrated} row(s); freed ${(
        result.bytesFreed /
        (1024 * 1024)
      ).toFixed(1)} MB of Convex storage.`,
    );
  } else {
    console.log(
      `\n[dry-run] Would patch ${migrated} row(s) and free ${(
        totalBytes /
        (1024 * 1024)
      ).toFixed(1)} MB.`,
    );
  }

  console.log(
    "\nNext: review the new files in public/gallery/, commit, and deploy.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
