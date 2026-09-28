#!/usr/bin/env node
/**
 * One-command annual gallery import:
 *
 *   npm run gallery:import            # all years in gallery-import/
 *   npm run gallery:import -- 2026    # a single year
 *   npm run gallery:import -- --no-clear
 *
 * Pipeline:
 *   1. register-static-gallery  → optimizes photos into public/gallery/<year>/
 *                                  and registers rows in Convex (IMPORT_SECRET)
 *   2. gallery:sync             → merges captions/album info into
 *                                  src/data/galleryManifest.json
 *   3. gallery:check            → verifies manifest matches the files
 *   4. git                      → stages the new/changed files for commit
 *
 * Requires IMPORT_SECRET in .env.local (and the Convex dashboard) and a
 * clean git tree for the files it stages. On Windows it invokes npm via
 * npm.cmd; everywhere else via npm.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, label) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`✗ Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`✗ ${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

function gitIsClean(paths) {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--", ...paths],
    { cwd: ROOT, encoding: "utf8" },
  );
  return result.status === 0 && result.stdout.trim() === "";
}

const targets = process.argv.slice(2);
run(
  NPM,
  ["run", "upload-gallery", "--", ...targets],
  "Step 1/3 — optimize files into public/gallery + register rows in Convex",
);
run(
  NPM,
  ["run", "gallery:sync"],
  "Step 2/3 — sync the committed gallery manifest",
);
run(
  NPM,
  ["run", "gallery:check"],
  "Step 3/3 — verify manifest matches committed files",
);

const toStage = [
  "public/gallery",
  "src/data/galleryManifest.json",
];
if (!gitIsClean(toStage)) {
  run(
    "git",
    ["add", "--", ...toStage],
    "Staging gallery files + manifest",
  );
  console.log(
    "\n✓ Staged. Finish with: git commit && git push — deploying publishes the new album.",
  );
} else {
  console.log(
    "\n✓ Nothing to stage — files and manifest were already up to date.",
  );
}
