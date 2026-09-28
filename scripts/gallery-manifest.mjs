#!/usr/bin/env node
/**
 * Gallery manifest tooling — two modes:
 *
 *   node scripts/gallery-manifest.mjs check
 *       Fails if public/gallery/ contents and src/data/galleryManifest.json
 *       disagree in either direction: a committed image missing from the
 *       manifest, or a manifest row pointing at a missing file. Run
 *       automatically by `npm run build` so a registered-but-never-committed
 *       (or committed-but-never-registered) photo breaks CI, not production.
 *
 *   node scripts/gallery-manifest.mjs sync
 *       Regenerates the manifest from public/gallery/ (new year folders are
 *       picked up automatically). Captions, titles, and themes merge from
 *       Convex when reachable, so caption/album edits made in the admin
 *       dashboard flow into the public site; otherwise previous manifest
 *       values are kept.
 *
 * Year-agnostic by design: adding a new year is just
 *   1. put photos in gallery-import/<year>/ (or public/gallery/<year>/)
 *   2. npm run upload-gallery      → optimizes files + registers rows in Convex
 *   3. npm run gallery:sync        → extends the manifest
 *   4. commit + deploy
 *
 * Caption workflow: edit captions in Admin → Galleries, then run
 * `npm run gallery:sync` and commit the manifest — the public site reads
 * only the manifest, so edits publish with that commit.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_GALLERY = path.join(ROOT, "public", "gallery");
const MANIFEST_PATH = path.join(ROOT, "src", "data", "galleryManifest.json");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

/** Minimal .env.local loader (same convention as the other scripts). */
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

/**
 * Best-effort pull of admin-curated captions/titles/themes from Convex so
 * `sync` publishes edits made in the admin dashboard. Returns {} on any
 * failure (offline, missing env) — file captions remain the fallback.
 */
async function loadDbCurations() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return {};
  }
  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../convex/_generated/api.js");
    const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
    const galleries = await client.query(api.content.listGalleries, {});
    const byYear = {};
    for (const gallery of galleries) {
      const captions = {};
      for (const image of gallery.images) {
        if (image.imageUrl && image.caption) {
          captions[path.basename(image.imageUrl)] = image.caption;
        }
      }
      byYear[gallery.year] = {
        title: gallery.title,
        theme: gallery.theme,
        captions,
      };
    }
    return byYear;
  } catch (error) {
    console.warn(
      `  (note: could not load captions from Convex — ${error instanceof Error ? error.message : error})`,
    );
    return {};
  }
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { galleries: [] };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function scanPublicGallery() {
  if (!fs.existsSync(PUBLIC_GALLERY)) {
    return [];
  }
  const galleries = [];
  for (const entry of fs.readdirSync(PUBLIC_GALLERY, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue;
    const year = Number(entry.name);
    const files = fs
      .readdirSync(path.join(PUBLIC_GALLERY, entry.name))
      .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
      .sort();
    if (files.length) {
      galleries.push({ year, files });
    }
  }
  galleries.sort((a, b) => b.year - a.year);
  return galleries;
}

function manifestRow(galleries, year) {
  return galleries.galleries.find((g) => g.year === year);
}

function buildManifest(existing, scanned, dbCurations = {}) {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    galleries: scanned.map(({ year, files }) => {
      const prev = manifestRow(existing, year);
      const db = dbCurations[year];
      return {
        year,
        // DB (admin dashboard) wins over the previous manifest so caption
        // and album edits made by admins flow into the public site.
        title: db?.title ?? prev?.title ?? `Homecoming ${year}`,
        theme: db?.theme ?? prev?.theme ?? "The Homecoming",
        images: files.map((fileName) => {
          const prevImage = prev?.images.find((i) => i.file === fileName);
          return {
            file: `/gallery/${year}/${fileName}`,
            caption: db?.captions?.[fileName] ?? prevImage?.caption,
          };
        }),
      };
    }),
  };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function check() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail("src/data/galleryManifest.json is missing. Run: npm run gallery:sync");
  }
  const manifest = readManifest();
  const scanned = scanPublicGallery();
  const problems = [];

  for (const gallery of manifest.galleries) {
    const scannedGallery = scanned.find(
      (g) => String(g.year) === String(gallery.year),
    );
    if (!scannedGallery) {
      if (gallery.images.length) {
        problems.push(
          `manifest has year ${gallery.year} but public/gallery/${gallery.year}/ does not exist`,
        );
      }
      continue;
    }
    const files = new Set(scannedGallery.files);
    for (const image of gallery.images) {
      if (!files.has(path.basename(image.file))) {
        problems.push(
          `manifest row points at missing file: ${image.file}`,
        );
      }
    }
    for (const file of scannedGallery.files) {
      if (!gallery.images.some((i) => path.basename(i.file) === file)) {
        problems.push(
          `committed file missing from manifest: /gallery/${gallery.year}/${file}`,
        );
      }
    }
  }

  for (const { year } of scanned) {
    if (!manifest.galleries.some((g) => String(g.year) === String(year))) {
      problems.push(
        `public/gallery/${year}/ exists but the manifest has no year ${year} entry`,
      );
    }
  }

  if (problems.length) {
    console.error(
      `Gallery manifest is out of sync (${problems.length} problem${problems.length === 1 ? "" : "s"}):`,
    );
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    console.error("\nFix with: npm run gallery:sync && commit the manifest.");
    process.exit(1);
  }

  const total = scanned.reduce((sum, g) => sum + g.files.length, 0);
  console.log(
    `✓ Gallery manifest in sync — ${scanned.length} year(s), ${total} photo(s).`,
  );
}

async function sync() {
  const existing = readManifest();
  const scanned = scanPublicGallery();
  if (!scanned.length) {
    fail("No year folders found under public/gallery/ (e.g. public/gallery/2025/).");
  }

  const dbCurations = await loadDbCurations();
  if (Object.keys(dbCurations).length) {
    console.log(
      `  merged captions/album info from Convex for year(s): ${Object.keys(dbCurations).join(", ")}`,
    );
  }

  const manifest = buildManifest(existing, scanned, dbCurations);

  // Idempotence: skip the write when nothing but generatedAt would change,
  // so CI sync jobs don't produce no-op commits.
  const { generatedAt: _ignored, ...existingContent } = existing;
  const { generatedAt: _ignore2, ...manifestContent } = manifest;
  if (
    fs.existsSync(MANIFEST_PATH) &&
    JSON.stringify(existingContent) === JSON.stringify(manifestContent)
  ) {
    console.log(
      "✓ Manifest already up to date — nothing to write.",
    );
    return;
  }

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  const total = scanned.reduce((sum, g) => sum + g.files.length, 0);
  console.log(
    `✓ Wrote src/data/galleryManifest.json — ${scanned.length} year(s), ${total} photo(s).`,
  );
  for (const gallery of manifest.galleries) {
    console.log(`  ${gallery.year}: ${gallery.images.length} photo(s) — ${gallery.title}`);
  }
  console.log(
    "Commit the manifest to publish caption edits on the public site.",
  );
}

const mode = process.argv[2];
if (mode === "check") {
  check();
} else if (mode === "sync") {
  await sync();
} else {
  console.error("Usage: node scripts/gallery-manifest.mjs <check|sync>");
  process.exit(1);
}
