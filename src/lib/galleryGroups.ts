export const GALLERY_DAY_LABELS = [
  "Day 1 — Opening",
  "Day 2",
  "Day 3",
  "Day 4 — Closing",
] as const;

export const GALLERY_IMAGES_PER_DAY = 11;

export type GalleryGroup<T> = {
  id: string;
  label: string;
  images: T[];
  startIndex: number;
};

export function groupGalleryImages<T extends { _id: string }>(
  images: T[],
  labels: readonly string[] = GALLERY_DAY_LABELS,
  imagesPerDay: number = GALLERY_IMAGES_PER_DAY,
): GalleryGroup<T>[] {
  if (!images.length) return [];

  return labels
    .map((label, groupIndex) => {
      const startIndex = groupIndex * imagesPerDay;
      const groupImages = images.slice(startIndex, startIndex + imagesPerDay);

      if (!groupImages.length) return null;

      return {
        id: `group-${groupIndex}`,
        label,
        images: groupImages,
        startIndex,
      };
    })
    .filter((group): group is GalleryGroup<T> => group !== null);
}
