#!/usr/bin/env node
/**
 * Bulk upload gallery images from local folders into Convex storage.
 *
 * Setup:
 * 1. Set IMPORT_SECRET in Convex dashboard (Settings → Environment Variables)
 * 2. Add the same value to .env.local as IMPORT_SECRET=your-secret
 * 3. Create folders: gallery-import/2025/, gallery-import/2024/, etc.
 * 4. Place .jpg/.png/.webp images inside each year folder
 * 5. Run: npm run upload-gallery
 *
 * Requires an existing gallery record for each year (create in Admin → Galleries).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(ROOT, "gallery-import");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

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

if (!CONVEX_URL) {
  console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
  process.exit(1);
}

if (!IMPORT_SECRET) {
  console.error(
    "Missing IMPORT_SECRET. Set it in .env.local and in the Convex dashboard.",
  );
  process.exit(1);
}

if (!fs.existsSync(IMPORT_DIR)) {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
  console.log(`Created ${IMPORT_DIR}`);
  console.log("Add year folders (e.g. gallery-import/2025/) with images, then re-run.");
  process.exit(0);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function uploadFile(filePath) {
  const uploadUrl = await client.mutation(api.galleryStorage.generateBulkUploadUrl, {
    secret: IMPORT_SECRET,
  });

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`Upload failed for ${filePath}: ${response.status}`);
  }

  const { storageId } = await response.json();
  return storageId;
}

async function main() {
  const galleries = await client.query(api.content.listGalleries, {});
  const galleriesByYear = new Map(galleries.map((g) => [g.year, g]));

  const yearFolders = fs
    .readdirSync(IMPORT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (!yearFolders.length) {
    console.log("No year folders found in gallery-import/. Example: gallery-import/2025/");
    process.exit(0);
  }

  for (const folder of yearFolders) {
    const yearMatch = folder.match(/\d{4}/);
    if (!yearMatch) {
      console.warn(`Skipping ${folder} — no year found in folder name`);
      continue;
    }

    const year = Number(yearMatch[0]);
    const gallery = galleriesByYear.get(year);

    if (!gallery) {
      console.warn(
        `No gallery for year ${year}. Create one in Admin → Galleries first.`,
      );
      continue;
    }

    const folderPath = path.join(IMPORT_DIR, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
      .sort();

    if (!files.length) {
      console.log(`No images in ${folder}`);
      continue;
    }

    console.log(`\nUploading ${files.length} image(s) for ${gallery.title}...`);

    const images = [];
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const filePath = path.join(folderPath, fileName);
      process.stdout.write(`  [${i + 1}/${files.length}] ${fileName}... `);

      const storageId = await uploadFile(filePath);
      images.push({
        storageId,
        caption: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        order: i,
      });
      console.log("done");
    }

    await client.mutation(api.galleryStorage.registerBulkGalleryImages, {
      secret: IMPORT_SECRET,
      galleryId: gallery._id,
      images,
    });

    console.log(`Registered ${images.length} image(s) for ${gallery.title}`);
  }

  console.log("\nBulk import complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
