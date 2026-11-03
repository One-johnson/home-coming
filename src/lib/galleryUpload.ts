import type { Id } from "@convex/_generated/dataModel";

export async function uploadFileToConvex(
  file: File,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<"_storage">> {
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${file.name}`);
  }

  const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

