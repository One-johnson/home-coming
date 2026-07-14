"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { uploadFilesToConvex } from "@/lib/galleryUpload";

export function GalleryManager() {
  const { sessionToken } = useAdminSession();
  const galleries = useQuery(api.content.listGalleries);
  const generateUploadUrl = useMutation(api.galleryStorage.generateUploadUrl);
  const createGallery = useMutation(api.galleryStorage.createGallery);
  const addGalleryImage = useMutation(api.galleryStorage.addGalleryImage);
  const deleteGalleryImage = useMutation(api.galleryStorage.deleteGalleryImage);
  const deleteGallery = useMutation(api.galleryStorage.deleteGallery);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");

  const [newGallery, setNewGallery] = useState({
    year: new Date().getFullYear(),
    theme: "",
    title: "",
  });

  const selectedGallery = useMemo(
    () => galleries?.find((g) => g._id === selectedGalleryId),
    [galleries, selectedGalleryId],
  );

  const handleCreateGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      toast.error("Not signed in");
      return;
    }
    try {
      const id = await createGallery({ sessionToken, ...newGallery });
      setSelectedGalleryId(id);
      setNewGallery({
        year: new Date().getFullYear(),
        theme: "",
        title: "",
      });
      toast.success("Gallery created");
    } catch {
      toast.error("Failed to create gallery");
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!sessionToken) {
      toast.error("Not signed in");
      return;
    }
    if (!files?.length || !selectedGalleryId) {
      toast.error("Select a gallery first");
      return;
    }

    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (!imageFiles.length) {
      toast.error("No image files selected");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadLabel("Starting upload...");

    try {
      const galleryId = selectedGalleryId as Id<"galleries">;
      let completed = 0;

      for (const file of imageFiles) {
        setUploadLabel(`Uploading ${file.name}...`);
        const storageIds = await uploadFilesToConvex(
          [file],
          () => generateUploadUrl({ sessionToken }),
          (done, total, name) => {
            setUploadProgress(Math.round(((completed + done / total) / imageFiles.length) * 100));
            setUploadLabel(name === "done" ? file.name : `Uploading ${name}...`);
          },
        );

        await addGalleryImage({
          sessionToken,
          galleryId,
          storageId: storageIds[0],
          caption: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        });

        completed += 1;
        setUploadProgress(Math.round((completed / imageFiles.length) * 100));
      }

      toast.success(`Uploaded ${imageFiles.length} image(s)`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadLabel("");
    }
  };

  const handleDeleteImage = async (id: Id<"galleryImages">) => {
    if (!sessionToken) return;
    try {
      await deleteGalleryImage({ sessionToken, id });
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  };

  const handleDeleteGallery = async () => {
    if (!sessionToken || !selectedGalleryId) return;
    if (!confirm("Delete this gallery and all its images? This cannot be undone.")) {
      return;
    }
    try {
      await deleteGallery({
        sessionToken,
        id: selectedGalleryId as Id<"galleries">,
      });
      setSelectedGalleryId("");
      toast.success("Gallery deleted");
    } catch {
      toast.error("Failed to delete gallery");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Gallery Album</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreateGallery}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="space-y-2">
              <Label htmlFor="gallery-year">Year</Label>
              <Input
                id="gallery-year"
                type="number"
                required
                value={newGallery.year}
                onChange={(e) =>
                  setNewGallery({ ...newGallery, year: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gallery-theme">Theme</Label>
              <Input
                id="gallery-theme"
                required
                placeholder="The Homecoming"
                value={newGallery.theme}
                onChange={(e) =>
                  setNewGallery({ ...newGallery, theme: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="gallery-title">Title</Label>
              <Input
                id="gallery-title"
                required
                placeholder="Homecoming 2025 Highlights"
                value={newGallery.title}
                onChange={(e) =>
                  setNewGallery({ ...newGallery, title: e.target.value })
                }
              />
            </div>
            <Button type="submit" className="sm:col-span-2 lg:col-span-4">
              Create Gallery
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Gallery Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Select gallery</Label>
              <Select
                value={selectedGalleryId}
                onValueChange={(value) => setSelectedGalleryId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a gallery album" />
                </SelectTrigger>
                <SelectContent>
                  {(galleries ?? []).map((gallery) => (
                    <SelectItem key={gallery._id} value={gallery._id}>
                      {gallery.year} — {gallery.title} ({gallery.images.length}{" "}
                      photos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedGalleryId && (
              <Button variant="destructive" onClick={handleDeleteGallery}>
                Delete Gallery
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-files">Images (select multiple)</Label>
            <Input
              id="gallery-files"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={!selectedGalleryId || uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
            <p className="text-sm text-muted-foreground">
              Upload JPEG, PNG, or WebP files. Images are stored in Convex and
              served on the gallery pages automatically.
            </p>
          </div>

          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-muted-foreground">{uploadLabel}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedGallery && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedGallery.title} ({selectedGallery.images.length} images)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedGallery.images.length === 0 ? (
              <p className="text-muted-foreground">
                No images yet. Upload photos above.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {selectedGallery.images.map((image) => (
                  <div
                    key={image._id}
                    className="overflow-hidden rounded-xl border bg-muted/30"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {image.imageUrl ? (
                        <Image
                          src={image.imageUrl}
                          alt={image.caption ?? "Gallery image"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-medium">
                        {image.caption ?? "Untitled"}
                      </p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => handleDeleteImage(image._id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
