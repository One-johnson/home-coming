import { compressImageForUpload } from "@/lib/imageCompress";

export { compressImageForUpload };

export type GalleryForm = {
  year: number;
  theme: string;
  title: string;
};

export function emptyGalleryForm(): GalleryForm {
  return {
    year: new Date().getFullYear(),
    theme: "",
    title: "",
  };
}

/** Same canonical rule as sanitizeStaticGalleryPath in galleryStorage.ts. */
export function staticFileName(fileName: string, year: number): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const base =
    (dot > 0 ? fileName.slice(0, dot) : fileName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "photo";
  return `/gallery/${year}/${base}${ext}`;
}

/**
 * A gallery image prepared for the static (repo-hosted) pipeline: the row
 * points at the repo path; the optimized bytes are saved locally by the
 * admin and committed to public/ before the change goes live.
 */
export type PreparedStaticImage = {
  file: File;
  repoPath: string;
  savedBytes: number;
};

export async function prepareStaticImages(
  files: File[],
  year: number,
): Promise<PreparedStaticImage[]> {
  const prepared: PreparedStaticImage[] = [];
  for (const original of files) {
    const { file, savedBytes } = await compressImageForUpload(original);
    prepared.push({
      file,
      repoPath: staticFileName(file.name, year),
      savedBytes,
    });
  }
  return prepared;
}
