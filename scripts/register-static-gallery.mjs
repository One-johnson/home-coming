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
 * 2. Create folders: gallery-import/<year>/ and place full-resolution
 *    .jpg/.png/.webp images inside (captions derive from filenames).
 *    Files are auto-optimized into public/ (1600px long edge, quality 82 —
 *    the same targets as the site's client-side compressor).
 * 3. Run: npm run upload-gallery
 *
 *    For each year folder the script:
 *      - optimizes the files into public/gallery/<year>/ (unless --no-copy)
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
import sharp from "sharp";

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

const SKIP_OPTIMIZATION_EXT = new Set([".gif", ".svg", ".pdf"]);

/**
 * Optimizes one image into public/gallery/<year>/<name>: 1600px long edge,
 * quality 82 (same targets as the client-side compressor used for uploads).
 * GIF/SVG are copied through; animations and vectors would be ruined by a
 * raster re-encode. Returns the written file name (extension may change) and
 * bytes saved.
 */
async function optimizeInto(targetDir, sourcePath, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const base = fileName.slice(0, -ext.length);

  if (SKIP_OPTIMIZATION_EXT.has(ext)) {
    const target = path.join(targetDir, fileName);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(sourcePath, target);
      console.log(`  copied ${fileName} (no optimization for ${ext})`);
    }
    return { fileName, savedBytes: 0 };
  }

  const source = sharp(sourcePath, { failOn: "none" });
  const meta = await source.metadata();
  const needsResize = (meta.width ?? 0) > 1600 || (meta.height ?? 0) > 1600;
  const pipeline = needsResize
    ? source.rotate().resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
    : source.rotate();

  const isPng = ext === ".png";
  const outExt = isPng ? ".png" : ".jpg";
  const outName = `${base}${outExt}`;

  const optimized = isPng
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const originalSize = fs.statSync(sourcePath).size;

  // Never store something bigger than the source.
  if (optimized.length >= originalSize && !needsResize) {
    fs.copyFileSync(sourcePath, path.join(targetDir, fileName));
    return { fileName, savedBytes: 0 };
  }

  fs.writeFileSync(path.join(targetDir, outName), optimized);
  if (outName !== fileName) {
    console.log(`  ${fileName} → ${outName} (PNG kept PNG, size-optimized)`);
  }
  return {
    fileName: outName,
    savedBytes: Math.max(0, originalSize - optimized.length),
  };
}

/**
 * Optimizes each source file into public/gallery/<year>/ (idempotent).
 * Returns the final file names in order — extensions may change during the
 * optimization pass, so registration must use these.
 */
async function copyToPublic(year, files, folderPath) {
  const targetDir = path.join(PUBLIC_DIR, String(year));
  fs.mkdirSync(targetDir, { recursive: true });
  const finalFiles = [];
  let savedTotal = 0;
  for (const fileName of files) {
    const result = await optimizeInto(
      targetDir,
      path.join(folderPath, fileName),
      fileName,
    );
    finalFiles.push(result.fileName);
    savedTotal += result.savedBytes;
  }
  if (savedTotal > 0) {
    console.log(
      `  optimization saved ${(savedTotal / (1024 * 1024)).toFixed(1)} MB total`,
    );
  }
  return finalFiles;
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

    let finalFiles = files;
    if (!noCopy) {
      finalFiles = await copyToPublic(year, files, folderPath);
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

    const images = finalFiles.map((fileName, index) => ({
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
