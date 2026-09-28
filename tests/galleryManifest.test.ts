import { expect, test } from "vitest";
import {
  galleryManifest,
  getManifestGallery,
  listManifestGalleries,
} from "../src/lib/galleryManifest";

/**
 * The committed gallery manifest is the public pages' source of truth for
 * curated photos. `npm run build` verifies it against public/gallery/, so
 * these tests focus on the loader contract the pages rely on.
 */

test("manifest contains the curated years in descending order", () => {
  expect(galleryManifest.length).toBeGreaterThan(0);
  const years = galleryManifest.map((g) => g.year);
  expect([...years].sort((a, b) => b - a)).toEqual(years);
  for (const gallery of galleryManifest) {
    expect(gallery.images.length).toBeGreaterThan(0);
    expect(gallery.title).toContain(String(gallery.year));
  }
});

test("getManifestGallery returns latest year by default and matches year requests", () => {
  const latest = getManifestGallery();
  expect(latest).not.toBeNull();
  expect(latest?.year).toBe(galleryManifest[0].year);

  const first = galleryManifest[galleryManifest.length - 1];
  const requested = getManifestGallery(first.year);
  expect(requested?.year).toBe(first.year);

  // Unknown years fall back to the latest album instead of erroring.
  expect(getManifestGallery(1999)?.year).toBe(latest?.year);
});

test("listManifestGalleries feeds the albums index: covers, counts, newest first", () => {
  const albums = listManifestGalleries();
  expect(albums.length).toBe(galleryManifest.length);

  const years = albums.map((a) => a.year);
  expect([...years].sort((a, b) => b - a)).toEqual(years);

  for (const album of albums) {
    expect(album.cover).toBe(`/gallery/${album.year}/${album.cover.split("/").pop()}`);
    expect(album.count).toBe(album.entries.length);
    expect(album.entries[0]?.imageUrl).toBe(album.cover);
  }
});

test("every manifest entry exposes an imageUrl shaped for the grid and lightbox", () => {
  const gallery = getManifestGallery();
  expect(gallery).not.toBeNull();
  for (const [index, entry] of (gallery?.entries ?? []).entries()) {
    expect(entry._id).toBe(`${gallery?.year}-${index}`);
    expect(entry.imageUrl).toMatch(/^\/gallery\/\d{4}\//);
  }
});
