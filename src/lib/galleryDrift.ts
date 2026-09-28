import { galleryManifest } from "./galleryManifest";

/**
 * Detects drift between the admin's curated gallery data (Convex rows, the
 * curation surface) and the committed gallery manifest (what the public site
 * actually shows). Non-zero drift means caption/album edits exist that
 * `npm run gallery:sync` has not published into the manifest yet.
 */

export type DriftGalleryInput = {
  year: number;
  title: string;
  theme: string;
  images: { imageUrl?: string; caption?: string }[];
};

export type GalleryDrift = {
  /** True when any difference exists. */
  hasDrift: boolean;
  /** Per-year summaries, only for years with differences. */
  years: {
    year: number;
    titleChanged: boolean;
    themeChanged: boolean;
    /** file path → { db, manifest } caption pairs that differ (null = unset). */
    captions: { file: string; db: string | null; manifest: string | null }[];
  }[];
};

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function computeGalleryDrift(
  dbGalleries: DriftGalleryInput[],
): GalleryDrift {
  const years: GalleryDrift["years"] = [];

  for (const dbGallery of dbGalleries) {
    const manifestGallery = galleryManifest.find(
      (g) => g.year === dbGallery.year,
    );
    if (!manifestGallery) {
      // Album exists in the admin view but is not published at all.
      if (dbGallery.images.some((image) => normalize(image.imageUrl))) {
        years.push({
          year: dbGallery.year,
          titleChanged: true,
          themeChanged: true,
          captions: [],
        });
      }
      continue;
    }

    const manifestByFile = new Map(
      manifestGallery.images.map((image) => [image.file, image.caption]),
    );

    const captions: GalleryDrift["years"][number]["captions"] = [];
    for (const image of dbGallery.images) {
      const file = image.imageUrl?.split("/").pop();
      const dbCaption = normalize(image.caption);
      if (!file) continue;
      const manifestFile = `/gallery/${dbGallery.year}/${file}`;
      const manifestCaption = normalize(manifestByFile.get(manifestFile));
      if (dbCaption !== manifestCaption) {
        captions.push({
          file: manifestFile,
          db: dbCaption,
          manifest: manifestCaption,
        });
      }
    }

    const titleChanged = normalize(dbGallery.title) !==
      normalize(manifestGallery.title);
    const themeChanged = normalize(dbGallery.theme) !==
      normalize(manifestGallery.theme);

    if (titleChanged || themeChanged || captions.length > 0) {
      years.push({ year: dbGallery.year, titleChanged, themeChanged, captions });
    }
  }

  return { hasDrift: years.length > 0, years };
}
