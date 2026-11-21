"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  ImageUp,
  MoreHorizontal,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/admin/kit/EmptyState";
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
      toast.error(...toastFriendlyErrorParts(err, "Reorder failed"));
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
      toast.error(...toastFriendlyErrorParts(err, "Update failed"));
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
      toast.error(...toastFriendlyErrorParts(err, "Upload failed"));
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
      toast.error(...toastFriendlyErrorParts(err, "Replace failed"));
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
      toast.error(...toastFriendlyErrorParts(err, "Delete failed"));
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
      toast.error(...toastFriendlyErrorParts(err, "Seed failed"));
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
        <CardContent>
          {slides === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-[16/10] rounded-xl" />
              ))}
            </div>
          ) : ordered.length === 0 ? (
            <button
              type="button"
              disabled={uploading || !sessionToken}
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <EmptyState
                icon={ImagePlus}
                title="No hero slides yet"
                description="Click to add images, or load the default gallery set."
              />
            </button>
          ) : (
            <div className="admin-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ordered.map((slide, index) => (
                <div
                  key={slide._id}
                  className="group overflow-hidden rounded-xl border bg-card shadow-soft transition-shadow duration-300 hover:shadow-elevate"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                    {slide.imageUrl ? (
                      <Image
                        src={slide.imageUrl}
                        alt={slide.alt}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                        unoptimized={slide.imageUrl.startsWith("http")}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-xs font-semibold text-[#2b1b12] shadow">
                      {index + 1}
                    </span>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        disabled={index === 0}
                        onClick={() => void moveSlide(index, -1)}
                        aria-label="Move slide earlier"
                        title="Move earlier"
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        disabled={index === ordered.length - 1}
                        onClick={() => void moveSlide(index, 1)}
                        aria-label="Move slide later"
                        title="Move later"
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="secondary"
                              aria-label="Slide actions"
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={uploading}
                            onClick={() => {
                              setReplaceTargetId(slide._id);
                              replaceInputRef.current?.click();
                            }}
                          >
                            <ImageUp /> Replace image
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(slide)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="space-y-1 p-3">
                    <Label
                      htmlFor={`hero-alt-${slide._id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Alt text {getAlt(slide).trim() !== slide.alt ? "· saves when you leave the field" : ""}
                    </Label>
                    <Input
                      id={`hero-alt-${slide._id}`}
                      value={getAlt(slide)}
                      onChange={(e) =>
                        setAltDrafts((prev) => ({
                          ...prev,
                          [slide._id]: e.target.value,
                        }))
                      }
                      onBlur={() => {
                        if (getAlt(slide).trim() !== slide.alt) {
                          void saveAlt(slide);
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
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
