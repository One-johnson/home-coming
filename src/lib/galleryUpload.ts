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

export async function uploadFilesToConvex(
  files: File[],
  generateUploadUrl: () => Promise<string>,
  onProgress?: (completed: number, total: number, fileName: string) => void,
) {
  const storageIds: Id<"_storage">[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    const storageId = await uploadFileToConvex(file, generateUploadUrl);
    storageIds.push(storageId);
  }

  onProgress?.(files.length, files.length, "done");
  return storageIds;
}
