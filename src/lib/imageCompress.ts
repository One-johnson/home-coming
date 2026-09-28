/**
 * Client-side image compression before upload.
 *
 * Photos are resized (long edge <= MAX_EDGE) and re-encoded as WebP, which
 * typically cuts phone-photo uploads by 5-10x in storage and bandwidth.
 * Uses `createImageBitmap` with `imageOrientation: "from-image"` so EXIF
 * rotation is baked in (phone photos otherwise render sideways).
 *
 * Anything that should not be transcoded — PDFs, GIFs, already-tiny files,
 * or browsers without the encoding path — is returned unchanged and the
 * upload proceeds exactly as before.
 */

const MAX_EDGE = 1600;
const MIN_BYTES = 120 * 1024; // below this, compression cannot pay for itself
const WEBP_QUALITY = 0.82;

/** Content types we never transcode (documents, animation, transparency art). */
const SKIP_TYPES = new Set(["application/pdf", "image/gif", "image/svg+xml"]);

export type CompressResult = {
  file: File;
  /** Bytes saved; 0 when the original passed through untouched. */
  savedBytes: number;
  compressed: boolean;
};

async function encodeBitmap(
  bitmap: ImageBitmap,
  type: string,
  quality: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Compress an image File for upload. Returns the original file untouched
 * when compression is unnecessary, unsupported, or would not help.
 */
export async function compressImageForUpload(
  file: File,
): Promise<CompressResult> {
  const type = (file.type || "").toLowerCase();

  if (
    typeof document === "undefined" ||
    !type.startsWith("image/") ||
    SKIP_TYPES.has(type) ||
    file.size < MIN_BYTES ||
    typeof createImageBitmap !== "function"
  ) {
    return { file, savedBytes: 0, compressed: false };
  }

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    // Long-edge fit: never upscale.
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    let bitmapToEncode = bitmap;
    if (scale < 1) {
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: "high",
      });
      bitmap.close();
      bitmapToEncode = resized;
    }

    const webp = await encodeBitmap(bitmapToEncode, "image/webp", WEBP_QUALITY);
    bitmapToEncode.close();

    if (!webp || webp.size >= file.size) {
      // Encoding failed or WebP came out bigger (rare) — keep the original.
      return { file, savedBytes: 0, compressed: false };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const compressed = new File([webp], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: file.lastModified,
    });
    return {
      file: compressed,
      savedBytes: file.size - compressed.size,
      compressed: true,
    };
  } catch {
    // Undecodable file or transient failure — never block the upload.
    return { file, savedBytes: 0, compressed: false };
  }
}

/** Convenience wrapper: compress, upload, and report the saved bytes. */
export async function compressAndUpload(
  file: File,
  upload: (file: File) => Promise<unknown>,
): Promise<CompressResult> {
  const result = await compressImageForUpload(file);
  await upload(result.file);
  return result;
}
