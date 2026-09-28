#!/usr/bin/env node
/**
 * Static gallery registrar — pairs repo-hosted files under public/gallery/<year>/
 * with rows in the galleries / galleryImages tables.
 *
 * Unlike the old bulk uploader, no bytes are uploaded to Convex storage:
 * rows carry imageUrl = "/gallery/<year>/<file>" (served free by the Vercel
 * CDN as part of the Next.js deployment), so curated galleries cost $0.
 *
 * Setup:
 * 1. Set IMPORT_SECRET in .env.local and in the Convex dashboard.
 * 2. Create folders: gallery-import/<year>/ and place .jpg/.png/.webp images
 *    inside (captions derive from filenames, e.g. "opening-service.jpg").
 * 3. Run: npm run register-static-gallery
 *
 *    For each year folder the script:
 *      - copies the files to public/gallery/<year>/ (unless --no-copy)
 *      - ensures a galleries row exists for that year (auto-creates one
 *        titled "Homecoming <year>" unless the row already exists)
 *      - clears old rows for the gallery (unless --no-clear)
 *      - registers the rows via registerStaticGalleryImages
 *
 * To re-import one year only: node scripts/register-static-gallery.mjs 2025
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IMPORT_DIR = path.join(ROOT, "gallery-import");
const PUBLIC_DIR = path.join(ROOT, "public", "gallery");

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
  console.log(
    "Add year folders (e.g. gallery-import/2025/) with images, then re-run.",
  );
  process.exit(0);
}

const client = new ConvexHttpClient(CONVEX_URL);

/** Copies each source file to public/gallery/<year>/<name> (idempotent). */
function copyToPublic(year, files, folderPath) {
  const targetDir = path.join(PUBLIC_DIR, String(year));
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of files) {
    const target = path.join(targetDir, fileName);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(folderPath, fileName), target);
      console.log(`  copied ${fileName} → public/gallery/${year}/`);
    }
  }
}

async function main() {
  const onlyYear = process.argv[2];
  const noClear = process.argv.includes("--no-clear");
  const noCopy = process.argv.includes("--no-copy");

  const galleries = await client.query(api.content.listGalleries, {});
  const galleriesByYear = new Map(galleries.map((g) => [g.year, g]));

  const yearFolders = fs
    .readdirSync(IMPORT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (!yearFolders.length) {
    console.log(
      "No year folders found in gallery-import/. Example: gallery-import/2025/",
    );
    process.exit(0);
  }

  for (const folder of yearFolders) {
    const yearMatch = folder.match(/\d{4}/);
    if (!yearMatch) {
      console.warn(`Skipping ${folder} — no year found in folder name`);
      continue;
    }

    const year = Number(yearMatch[0]);
    if (onlyYear && year !== Number(onlyYear)) continue;

    let gallery = galleriesByYear.get(year);

    const folderPath = path.join(IMPORT_DIR, folder);
    const files = fs
      .readdirSync(folderPath)
      .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
      .sort();

    if (!files.length) {
      console.log(`No images in ${folder}`);
      continue;
    }

    if (!gallery) {
      console.log(`No gallery row for ${year} — creating "Homecoming ${year}"...`);
      await client.mutation(api.galleryStorage.createStaticGallery, {
        secret: IMPORT_SECRET,
        year,
      });
      const refreshed = await client.query(api.content.listGalleries, {});
      gallery = refreshed.find((g) => g.year === year);
    }

    if (!gallery) {
      console.warn(`Could not create gallery for year ${year}; skipping`);
      continue;
    }

    if (!noCopy) {
      copyToPublic(year, files, folderPath);
    } else {
      console.log(`  (--no-copy: assuming files already in public/gallery/${year}/)`);
    }

    if (!noClear) {
      console.log(`Clearing previous rows for ${gallery.title}...`);
      await client.mutation(api.galleryStorage.clearGalleryForImport, {
        secret: IMPORT_SECRET,
        year,
      });
    }

    const images = files.map((fileName, index) => ({
      path: fileName,
      caption: fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      order: index,
    }));

    await client.mutation(api.galleryStorage.registerStaticGalleryImages, {
      secret: IMPORT_SECRET,
      galleryId: gallery._id,
      images,
    });

    console.log(
      `Registered ${images.length} static image(s) for ${gallery.title}`,
    );
  }

  console.log("\nStatic gallery registration complete.");
  console.log(
    "Next: run `npm run gallery:sync` to update the manifest, then commit public/gallery + src/data/galleryManifest.json.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
