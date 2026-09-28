#!/usr/bin/env node
/**
 * Tours manifest tooling — mirrors scripts/gallery-manifest.mjs for the
 * (much smaller) tour-package catalog.
 *
 *   node scripts/tours-manifest.mjs sync
 *       Regenerates src/data/toursManifest.json from the active tour
 *       packages in Convex (idempotent — no write when nothing changed).
 *
 *   node scripts/tours-manifest.mjs check
 *       Fails when the manifest is missing, malformed, internally
 *       inconsistent, or points an image at a repo path that does not exist
 *       under public/. Runs automatically via `npm run build`.
 *
 * The manifest is DISPLAY-ONLY: the public /tours page renders packages from
 * it with zero Convex queries, while tour orders keep resolving packages
 * (and prices) from the database server-side, so checkout can never be
 * manipulated through the manifest.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const MANIFEST_PATH = path.join(ROOT, "src", "data", "toursManifest.json");

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

async function loadDbPackages() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    fail("Missing NEXT_PUBLIC_CONVEX_URL in .env.local — cannot sync tours.");
  }
  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../convex/_generated/api.js");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  const packages = await client.query(api.tourPackages.listPublic, {});
  return packages.map((pkg) => ({
    slug: pkg.slug,
    label: pkg.label,
    dateLabel: pkg.dateLabel,
    timeRange: pkg.timeRange,
    sites: pkg.sites,
    meals: pkg.meals,
    priceUsd: pkg.priceUsd,
    priceGhs: pkg.priceGhs,
    // Resolve the same display-image precedence as the app: uploaded blob
    // (already a URL in displayImageUrl) → explicit imageUrl → slug default
    // is NOT baked in here; the app resolves slug fallbacks at render time.
    image: pkg.displayImageUrl ?? pkg.imageUrl ?? undefined,
    badge: pkg.badge,
    order: pkg.order,
  }));
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { packages: [] };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function check() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail("src/data/toursManifest.json is missing. Run: npm run tours:sync");
  }
  const manifest = readManifest();
  const problems = [];
  const slugs = new Set();

  if (!Array.isArray(manifest.packages)) {
    fail("Manifest must contain a packages array.");
  }

  for (const pkg of manifest.packages) {
    const where = `package "${pkg.slug ?? "?"}"`;
    if (!pkg.slug || !/^[a-z0-9_-]+$/.test(pkg.slug)) {
      problems.push(`${where}: missing or invalid slug`);
      continue;
    }
    if (slugs.has(pkg.slug)) {
      problems.push(`${where}: duplicate slug`);
    }
    slugs.add(pkg.slug);
    for (const field of ["label", "dateLabel", "timeRange", "meals"]) {
      if (typeof pkg[field] !== "string" || !pkg[field].trim()) {
        problems.push(`${where}: missing ${field}`);
      }
    }
    if (!Array.isArray(pkg.sites) || pkg.sites.length === 0) {
      problems.push(`${where}: needs at least one site`);
    }
    if (typeof pkg.priceUsd !== "number" || pkg.priceUsd < 0) {
      problems.push(`${where}: invalid priceUsd`);
    }
    if (
      pkg.priceGhs !== undefined &&
      (typeof pkg.priceGhs !== "number" || pkg.priceGhs < 0)
    ) {
      problems.push(`${where}: invalid priceGhs`);
    }
    if (typeof pkg.image === "string" && pkg.image.startsWith("/")) {
      const file = path.join(PUBLIC_DIR, pkg.image);
      if (!fs.existsSync(file)) {
        problems.push(`${where}: image ${pkg.image} does not exist in public/`);
      }
    }
  }

  if (problems.length) {
    console.error(
      `Tours manifest is invalid (${problems.length} problem${problems.length === 1 ? "" : "s"}):`,
    );
    for (const problem of problems) {
      console.error(`  - ${problem}`);
    }
    process.exit(1);
  }

  console.log(
    `✓ Tours manifest valid — ${manifest.packages.length} package(s).`,
  );
}

async function sync() {
  const packages = await loadDbPackages();
  const manifest = {
    generatedAt: new Date().toISOString(),
    packages,
  };

  const existing = readManifest();
  const { generatedAt: _ignored, ...existingContent } = existing;
  const { generatedAt: _ignore2, ...manifestContent } = manifest;
  if (
    fs.existsSync(MANIFEST_PATH) &&
    JSON.stringify(existingContent) === JSON.stringify(manifestContent)
  ) {
    console.log("✓ Tours manifest already up to date — nothing to write.");
    return;
  }

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `✓ Wrote src/data/toursManifest.json — ${packages.length} package(s).`,
  );
  console.log("Commit the manifest to publish tour changes on the site.");
}

const mode = process.argv[2];
if (mode === "check") {
  check();
} else if (mode === "sync") {
  await sync();
} else {
  console.error("Usage: node scripts/tours-manifest.mjs <check|sync>");
  process.exit(1);
}
