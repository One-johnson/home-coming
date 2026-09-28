import rawManifest from "../data/galleryManifest.json";

/**
 * Curated galleries are repo-hosted static files under public/gallery/<year>/
 * (see scripts/gallery-manifest.mjs). This committed manifest is the source
 * of truth for the public pages — no Convex query, no storage cost — and is
 * verified against public/ on every `npm run build`, so a registered or
 * committed photo can never silently 404 in production.
 */

export type ManifestGalleryImage = {
  /** Repo path the file is served from, e.g. "/gallery/2025/photo-01.jpg". */
  file: string;
  caption?: string;
};

export type ManifestGallery = {
  year: number;
  title: string;
  theme: string;
  images: ManifestGalleryImage[];
};

export const galleryManifest: ManifestGallery[] = (
  rawManifest as {
    galleries: ManifestGallery[];
  }
).galleries;

export type ManifestImageEntry = {
  _id: string;
  /** Same value as `file`, shaped for the grid/lightbox components. */
  imageUrl: string;
  caption?: string;
};

function toEntries(gallery: ManifestGallery): ManifestImageEntry[] {
  return gallery.images.map((image, index) => ({
    _id: `${gallery.year}-${index}`,
    imageUrl: image.file,
    caption: image.caption,
  }));
}

export function getManifestGallery(year?: number): (ManifestGallery & {
  entries: ManifestImageEntry[];
}) | null {
  const gallery =
    (year && galleryManifest.find((g) => g.year === year)) ||
    galleryManifest[0];
  if (!gallery || gallery.images.length === 0) {
    return null;
  }
  return { ...gallery, entries: toEntries(gallery) };
}
