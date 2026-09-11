"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadFileToConvex } from "@/lib/galleryUpload";

type SlideRow = {
  _id: Id<"heroSlides">;
  alt: string;
  order: number;
  imageUrl: string;
};

export function HeroManager() {
  const { sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const slides = useQuery(
    api.heroSlides.listAdmin,
    sessionArgs ? sessionArgs : "skip",
  );
  const generateUploadUrl = useMutation(api.galleryStorage.generateUploadUrl);
  const addSlide = useMutation(api.heroSlides.add);
  const updateSlide = useMutation(api.heroSlides.update);
  const removeSlide = useMutation(api.heroSlides.remove);
  const reorderSlides = useMutation(api.heroSlides.reorder);
  const seedDefaults = useMutation(api.heroSlides.seedDefaults);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [replaceTargetId, setReplaceTargetId] = useState<Id<"heroSlides"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SlideRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const ordered = slides ?? [];

  const getAlt = (slide: SlideRow) =>
    altDrafts[slide._id] ?? slide.alt;

  const moveSlide = async (index: number, direction: -1 | 1) => {
    if (!sessionToken || !slides) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    try {
      await reorderSlides({
        sessionToken,
        orderedIds: next.map((slide) => slide._id),
      });
      toast.success("Slide order updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
    }
  };

  const saveAlt = async (slide: SlideRow) => {
    if (!sessionToken) return;
    const alt = getAlt(slide).trim();
    if (!alt || alt === slide.alt) return;
    try {
      await updateSlide({ sessionToken, id: slide._id, alt });
      setAltDrafts((prev) => {
        const copy = { ...prev };
        delete copy[slide._id];
        return copy;
      });
      toast.success("Alt text saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleAddFiles = async (files: FileList | null) => {
    if (!sessionToken || !files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const storageId = await uploadFileToConvex(file, () =>
          generateUploadUrl({ sessionToken }),
        );
        await addSlide({
          sessionToken,
          storageId,
          alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        });
      }
      toast.success(
        `Added ${files.length} hero slide${files.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReplaceFile = async (files: FileList | null) => {
    if (!sessionToken || !replaceTargetId || !files?.[0]) return;
    setUploading(true);
    try {
      const storageId = await uploadFileToConvex(files[0], () =>
        generateUploadUrl({ sessionToken }),
      );
      await updateSlide({
        sessionToken,
        id: replaceTargetId,
        storageId,
      });
      toast.success("Hero image replaced");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setUploading(false);
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await removeSlide({ sessionToken, id: deleteTarget._id });
      toast.success("Hero slide deleted");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (!sessionToken) return;
    try {
      const result = await seedDefaults({ sessionToken });
      if (result.seeded) {
        toast.success(`Loaded ${result.count} default slides`);
      } else {
        toast.message("Hero slides already exist");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Homepage hero images</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload, replace, and reorder the carousel slides on the landing
              page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ordered.length === 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSeedDefaults()}
              >
                Load defaults
              </Button>
            )}
            <Button
              type="button"
              disabled={uploading || !sessionToken}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              {uploading ? "Uploading…" : "Add images"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => void handleAddFiles(e.target.files)}
            />
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void handleReplaceFile(e.target.files)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {slides === undefined ? (
            <p className="text-sm text-muted-foreground">Loading slides…</p>
          ) : ordered.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No hero slides yet. Add images or load the default gallery set.
            </p>
          ) : (
            ordered.map((slide, index) => (
              <div
                key={slide._id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
              >
                <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:w-44">
                  {slide.imageUrl ? (
                    <Image
                      src={slide.imageUrl}
                      alt={slide.alt}
                      fill
                      className="object-cover"
                      sizes="176px"
                      unoptimized={slide.imageUrl.startsWith("http")}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-ink">
                      Slide {index + 1}
                    </span>
                    <span>·</span>
                    <span>Order {slide.order + 1}</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`hero-alt-${slide._id}`}>Alt text</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id={`hero-alt-${slide._id}`}
                        value={getAlt(slide)}
                        onChange={(e) =>
                          setAltDrafts((prev) => ({
                            ...prev,
                            [slide._id]: e.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={getAlt(slide).trim() === slide.alt}
                        onClick={() => void saveAlt(slide)}
                      >
                        <Pencil className="size-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5 sm:flex-col">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => void moveSlide(index, -1)}
                    aria-label="Move slide up"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={index === ordered.length - 1}
                    onClick={() => void moveSlide(index, 1)}
                    aria-label="Move slide down"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => {
                      setReplaceTargetId(slide._id);
                      replaceInputRef.current?.click();
                    }}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(slide)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete hero slide?"
        description={`“${deleteTarget?.alt ?? "This slide"}” will be removed from the homepage carousel.`}
        confirmLabel="Delete slide"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
