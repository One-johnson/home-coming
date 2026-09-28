#!/usr/bin/env node
/**
 * Content backup — snapshots the curated content tables (galleries with
 * their images, FAQs, messages) to a dated JSON file.
 *
 *   node scripts/backup-content.mjs [output-dir]
 *
 * Default output: backups/content-<timestamp>.json. The weekly GitHub
 * workflow uploads each snapshot as a CI artifact, so curated content has
 * a restore point independent of the database.
 *
 * Read-only: only public queries are called; no credentials required
 * beyond NEXT_PUBLIC_CONVEX_URL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    fail("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("../convex/_generated/api.js");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

  const [galleries, faqs, messages] = await Promise.all([
    client.query(api.content.listGalleries, {}),
    client.query(api.content.listFaqs, {}),
    client.query(api.content.listMessages, {}),
  ]);

  // Keep only data worth restoring; drop volatile fields.
  const snapshot = {
    capturedAt: new Date().toISOString(),
    deployment: process.env.NEXT_PUBLIC_CONVEX_URL,
    galleries: galleries.map((gallery) => ({
      year: gallery.year,
      title: gallery.title,
      theme: gallery.theme,
      images: gallery.images.map((image) => ({
        imageUrl: image.imageUrl,
        caption: image.caption,
        order: image.order,
      })),
    })),
    faqs: faqs.map((faq) => ({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    })),
    messages: messages.map((message) => ({
      year: message.year,
      title: message.title,
      speaker: message.speaker,
      mediaType: message.mediaType,
      url: message.url,
      order: message.order,
    })),
  };

  const outDir = process.argv[2] ?? path.join(ROOT, "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = snapshot.capturedAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `content-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");

  console.log(
    `✓ Backed up ${snapshot.galleries.length} gallery/galleries, ${snapshot.faqs.length} FAQs, ${snapshot.messages.length} messages → ${path.relative(ROOT, outPath)}`,
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
