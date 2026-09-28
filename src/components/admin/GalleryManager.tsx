"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  compressImageForUpload,
  emptyGalleryForm,
  type GalleryForm,
  staticFileName,
} from "./galleryManagerForm";
import { cn } from "@/lib/utils";

function galleryLabel(gallery: {
  year: number;
  title: string;
  images: unknown[];
}) {
  return `${gallery.year} — ${gallery.title} (${gallery.images.length} photos)`;
}

export function GalleryManager() {
  const { sessionToken } = useAdminSession();
  const galleries = useQuery(api.content.listGalleries);
  const createGallery = useMutation(api.galleryStorage.createGallery);
  const updateGallery = useMutation(api.galleryStorage.updateGallery);
  const updateGalleryImage = useMutation(api.galleryStorage.updateGalleryImage);
  const addGalleryImage = useMutation(api.galleryStorage.addStaticGalleryImage);
  const deleteGalleryImage = useMutation(api.galleryStorage.deleteGalleryImage);
  const bulkDeleteGalleryImages = useMutation(
    api.galleryStorage.bulkDeleteGalleryImages,
  );
  const deleteGallery = useMutation(api.galleryStorage.deleteGallery);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [newGallery, setNewGallery] = useState<GalleryForm>(emptyGalleryForm);
  const [selectedImageIds, setSelectedImageIds] = useState<
    Set<Id<"galleryImages">>
  >(new Set());

  const [editAlbumOpen, setEditAlbumOpen] = useState(false);
  const [editAlbumForm, setEditAlbumForm] = useState<GalleryForm>(
    emptyGalleryForm(),
  );
  const [savingAlbum, setSavingAlbum] = useState(false);

  const [editCaptionOpen, setEditCaptionOpen] = useState(false);
  const [editingImageId, setEditingImageId] =
    useState<Id<"galleryImages"> | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "gallery" }
    | { type: "image"; id: Id<"galleryImages"> }
    | { type: "bulk" }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const selectedGallery = useMemo(
    () => galleries?.find((g) => g._id === selectedGalleryId),
    [galleries, selectedGalleryId],
  );

  const galleryItems = useMemo(
    () =>
      (galleries ?? []).map((gallery) => ({
        value: gallery._id,
        label: galleryLabel(gallery),
      })),
    [galleries],
  );

  const clearImageSelection = () => setSelectedImageIds(new Set());

  const toggleImageSelected = (id: Id<"galleryImages">) => {
    setSelectedImageIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllImages = () => {
    if (!selectedGallery) return;
    if (selectedImageIds.size === selectedGallery.images.length) {
      clearImageSelection();
      return;
    }
    setSelectedImageIds(
      new Set(selectedGallery.images.map((image) => image._id)),
    );
  };

  const handleCreateGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      toast.error("Not signed in");
      return;
    }
    try {
      const id = await createGallery({ sessionToken, ...newGallery });
      setSelectedGalleryId(id);
      setNewGallery(emptyGalleryForm());
      clearImageSelection();
      toast.success("Gallery created");
    } catch {
      toast.error("Failed to create gallery");
    }
  };

  const openEditAlbum = () => {
    if (!selectedGallery) return;
    setEditAlbumForm({
      year: selectedGallery.year,
      theme: selectedGallery.theme,
      title: selectedGallery.title,
    });
    setEditAlbumOpen(true);
  };

  const handleSaveAlbum = async () => {
    if (!sessionToken || !selectedGalleryId) return;
    setSavingAlbum(true);
    try {
      await updateGallery({
        sessionToken,
        id: selectedGalleryId as Id<"galleries">,
        ...editAlbumForm,
      });
      setEditAlbumOpen(false);
      toast.success("Album updated");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update album"));
    } finally {
      setSavingAlbum(false);
    }
  };

  const openEditCaption = (image: {
    _id: Id<"galleryImages">;
    caption?: string;
  }) => {
    setEditingImageId(image._id);
    setCaptionDraft(image.caption ?? "");
    setEditCaptionOpen(true);
  };

  const handleSaveCaption = async () => {
    if (!sessionToken || !editingImageId) return;
    setSavingCaption(true);
    try {
      await updateGalleryImage({
        sessionToken,
        id: editingImageId,
        caption: captionDraft,
      });
      setEditCaptionOpen(false);
      setEditingImageId(null);
      toast.success("Caption updated");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update caption"));
    } finally {
      setSavingCaption(false);
    }
  };

  /**
   * Client-side compression pass (same as receipts), then register rows that
   * point at the repo-hosted static file. No Convex storage is used — admins
   * commit the optimized files via git and the Vercel CDN serves them free.
   */
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

    setSaving(true);
    setSaveLabel("Preparing files...");

    try {
      const galleryId = selectedGalleryId as Id<"galleries">;
      const gallery = galleries?.find((g) => g._id === selectedGalleryId);
      const year = gallery?.year ?? new Date().getFullYear();
      let completed = 0;
      let savedTotal = 0;

      for (const original of imageFiles) {
        setSaveLabel(`Optimizing ${original.name}...`);
        const { file, savedBytes } = await compressImageForUpload(original);
        savedTotal += savedBytes;

        setSaveLabel(`Registering ${file.name}...`);
        await addGalleryImage({
          sessionToken,
          galleryId,
          fileName: staticFileName(file.name, year),
          caption: original.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        });

        completed += 1;
        setSaveLabel(
          `Registered ${completed}/${imageFiles.length} — commit the optimized files in public/gallery/${year}/ to publish`,
        );
      }

      toast.success(
        savedTotal > 0
          ? `Registered ${imageFiles.length} image(s) — saved ${(
              savedTotal / (1024 * 1024)
            ).toFixed(1)} MB with optimization`
          : `Registered ${imageFiles.length} image(s)`,
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      toast.error(
        ...toastFriendlyErrorParts(error, "Failed to register images"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "gallery") {
        await deleteGallery({
          sessionToken,
          id: selectedGalleryId as Id<"galleries">,
        });
        setSelectedGalleryId("");
        clearImageSelection();
        toast.success("Gallery deleted");
      } else if (deleteTarget.type === "image") {
        await deleteGalleryImage({ sessionToken, id: deleteTarget.id });
        setSelectedImageIds((current) => {
          const next = new Set(current);
          next.delete(deleteTarget.id);
          return next;
        });
        toast.success("Image deleted");
      } else {
        const ids = [...selectedImageIds];
        const result = await bulkDeleteGalleryImages({ sessionToken, ids });
        clearImageSelection();
        toast.success(
          `Deleted ${result.deleted} image${result.deleted === 1 ? "" : "s"}`,
        );
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  const deleteDialogCopy = (() => {
    if (!deleteTarget) {
      return { title: "", description: "", confirmLabel: "Delete" };
    }
    if (deleteTarget.type === "gallery") {
      return {
        title: "Delete gallery album?",
        description:
          "This will permanently delete the album and all of its images. This cannot be undone.",
        confirmLabel: "Delete album",
      };
    }
    if (deleteTarget.type === "image") {
      return {
        title: "Delete image?",
        description: "This image will be permanently removed from the album.",
        confirmLabel: "Delete image",
      };
    }
    const count = selectedImageIds.size;
    return {
      title: `Delete ${count} image${count === 1 ? "" : "s"}?`,
      description: "Selected images will be permanently removed from the album.",
      confirmLabel: `Delete ${count}`,
    };
  })();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create album</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateGallery} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="gallery-year">Year</Label>
                <Input
                  id="gallery-year"
                  type="number"
                  required
                  value={newGallery.year}
                  onChange={(e) =>
                    setNewGallery({
                      ...newGallery,
                      year: Number(e.target.value),
                    })
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
              <div className="space-y-2">
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
              <Button type="submit" className="w-full">
                Create gallery
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Manage album</CardTitle>
              <p className="text-sm text-muted-foreground">
                Select an album to register photos, or edit captions and album
                details (published via the gallery manifest).
              </p>
            </div>
            {selectedGalleryId ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Album actions</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEditAlbum}>
                    <Pencil />
                    Edit album
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget({ type: "gallery" })}
                  >
                    <Trash2 />
                    Delete album
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Gallery album</Label>
              <Select
                value={selectedGalleryId || null}
                items={galleryItems}
                onValueChange={(value) => {
                  setSelectedGalleryId(value ?? "");
                  clearImageSelection();
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a gallery album" />
                </SelectTrigger>
                <SelectContent>
                  {(galleries ?? []).map((gallery) => (
                    <SelectItem key={gallery._id} value={gallery._id}>
                      {galleryLabel(gallery)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gallery-files">Register images</Label>
              <Input
                id="gallery-files"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={!selectedGalleryId || saving}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <p className="text-sm text-muted-foreground">
                Rows point at repo-hosted files in public/gallery — zero storage
                cost. Save the optimized files locally with the exact listed
                names, commit them, and run gallery:sync to publish.
              </p>
            </div>

            {saving && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{saveLabel}</p>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <p className="text-sm font-medium">Publishing</p>
              <p className="text-sm text-muted-foreground">
                Captions and album edits go live when the gallery manifest is
                regenerated and committed. From the project root:
              </p>
              <code className="block rounded bg-muted px-2 py-1 text-xs">
                npm run gallery:sync && git commit src/data/galleryManifest.json
              </code>
              <p className="text-sm text-muted-foreground">
                The public site reads only the committed manifest, so an edit is
                not live until that commit deploys.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedGallery && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">
                {selectedGallery.title}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedGallery.year} · {selectedGallery.theme} ·{" "}
                {selectedGallery.images.length} images
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedGallery.images.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleSelectAllImages}
                >
                  {selectedImageIds.size === selectedGallery.images.length
                    ? "Clear selection"
                    : "Select all"}
                </Button>
              )}
              {selectedImageIds.size > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setDeleteTarget({ type: "bulk" })}
                >
                  Delete selected ({selectedImageIds.size})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedGallery.images.length === 0 ? (
              <p className="text-muted-foreground">
                No images yet. Register photos above.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {selectedGallery.images.map((image) => {
                  const selected = selectedImageIds.has(image._id);
                  return (
                    <div
                      key={image._id}
                      className={cn(
                        "group relative overflow-hidden rounded-md border bg-muted/30",
                        selected && "ring-2 ring-primary",
                      )}
                    >
                      <div className="relative aspect-square bg-muted">
                        {image.imageUrl ? (
                          <Image
                            src={image.imageUrl}
                            alt={image.caption ?? "Gallery image"}
                            fill
                            className="object-cover"
                            sizes="96px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                            No preview
                          </div>
                        )}
                        <div className="absolute top-1 left-1">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() =>
                              toggleImageSelected(image._id)
                            }
                            aria-label={`Select ${image.caption ?? "image"}`}
                            className="border-background bg-background/90 shadow-sm"
                          />
                        </div>
                        <div className="absolute top-1 right-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex size-6 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm hover:bg-background">
                              <MoreHorizontal className="size-3.5" />
                              <span className="sr-only">Image actions</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEditCaption(image)}
                              >
                                <Pencil />
                                Edit caption
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    type: "image",
                                    id: image._id,
                                  })
                                }
                              >
                                <Trash2 />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                        {image.caption ?? "Untitled"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={editAlbumOpen} onOpenChange={setEditAlbumOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit album</DialogTitle>
            <DialogDescription>
              Update the year, theme, and title for this gallery album.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="edit-gallery-year">Year</Label>
              <Input
                id="edit-gallery-year"
                type="number"
                value={editAlbumForm.year}
                onChange={(e) =>
                  setEditAlbumForm({
                    ...editAlbumForm,
                    year: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gallery-theme">Theme</Label>
              <Input
                id="edit-gallery-theme"
                value={editAlbumForm.theme}
                onChange={(e) =>
                  setEditAlbumForm({
                    ...editAlbumForm,
                    theme: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-gallery-title">Title</Label>
              <Input
                id="edit-gallery-title"
                value={editAlbumForm.title}
                onChange={(e) =>
                  setEditAlbumForm({
                    ...editAlbumForm,
                    title: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingAlbum}
              onClick={() => setEditAlbumOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingAlbum}
              onClick={() => void handleSaveAlbum()}
            >
              {savingAlbum ? "Saving…" : "Save album"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editCaptionOpen} onOpenChange={setEditCaptionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit caption</DialogTitle>
            <DialogDescription>
              Shown in the admin preview. To publish it on the public gallery,
              run gallery:sync and commit the manifest.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-caption">Caption</Label>
            <Input
              id="edit-caption"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={savingCaption}
              onClick={() => setEditCaptionOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingCaption}
              onClick={() => void handleSaveCaption()}
            >
              {savingCaption ? "Saving…" : "Save caption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteDialogCopy.title}
        description={deleteDialogCopy.description}
        confirmLabel={deleteDialogCopy.confirmLabel}
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
