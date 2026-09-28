import { expect, test } from "vitest";
import { galleryManifest } from "../src/lib/galleryManifest";
import { computeGalleryDrift } from "../src/lib/galleryDrift";

/**
 * The drift helper powers the admin "pending publish" indicator: it compares
 * Convex gallery rows (admin curation surface) against the committed
 * manifest (public source of truth).
 */

function dbGalleryFor(
  year: number,
  overrides: Partial<{
    title: string;
    theme: string;
    captions: Record<string, string>;
  }> = {},
) {
  const manifestGallery = galleryManifest.find((g) => g.year === year);
  if (!manifestGallery) throw new Error(`no manifest gallery for ${year}`);
  return {
    year,
    title: overrides.title ?? manifestGallery.title,
    theme: overrides.theme ?? manifestGallery.theme,
    images: manifestGallery.images.map((image) => ({
      imageUrl: image.file,
      // Post-sync reality: DB captions match the manifest unless a test
      // overrides them.
      caption:
        overrides.captions?.[image.file.split("/").pop() ?? ""] ??
        image.caption,
    })),
  };
}

test("no drift when DB matches the published manifest", () => {
  const drift = computeGalleryDrift([dbGalleryFor(2025)]);
  expect(drift.hasDrift).toBe(false);
  expect(drift.years).toHaveLength(0);
});

test("detects caption edits and album title/theme changes", () => {
  const firstFile = galleryManifest
    .find((g) => g.year === 2025)!
    .images[0].file.split("/")
    .pop()!;
  const drift = computeGalleryDrift([
    dbGalleryFor(2025, {
      title: "Homecoming 2025 — Remastered",
      theme: "The Return",
      captions: { [firstFile]: "Opening service" },
    }),
  ]);

  expect(drift.hasDrift).toBe(true);
  expect(drift.years).toHaveLength(1);
  const year = drift.years[0];
  expect(year.year).toBe(2025);
  expect(year.titleChanged).toBe(true);
  expect(year.themeChanged).toBe(true);
  expect(year.captions).toEqual([
    {
      file: `/gallery/2025/${firstFile}`,
      db: "Opening service",
      manifest: galleryManifest
        .find((g) => g.year === 2025)!
        .images[0].caption ?? null,
    },
  ]);
});

test("treats whitespace-only caption differences as no drift", () => {
  const firstFile = galleryManifest
    .find((g) => g.year === 2025)!
    .images[0].file.split("/")
    .pop()!;
  const drift = computeGalleryDrift([
    dbGalleryFor(2025, { captions: { [firstFile]: "  homecoming 01  " } }),
  ]);
  expect(drift.hasDrift).toBe(false);
});

test("flags DB albums that are not published at all", () => {
  const drift = computeGalleryDrift([
    dbGalleryFor(2025),
    {
      year: 2024,
      title: "Homecoming 2024",
      theme: "The Homecoming",
      images: [{ imageUrl: "/gallery/2024/photo-01.jpg", caption: "Photo" }],
    },
  ]);
  expect(drift.hasDrift).toBe(true);
  expect(drift.years).toEqual([
    { year: 2024, titleChanged: true, themeChanged: true, captions: [] },
  ]);
});
