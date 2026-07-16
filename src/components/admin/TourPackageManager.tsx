"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { ImagePlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import { resolveTourImage } from "@/lib/tourConfig";

type TourPackageAdmin = Doc<"tourPackages"> & {
  displayImageUrl?: string | null;
};

type PackageDraft = {
  label: string;
  dateLabel: string;
  timeRange: string;
  sitesText: string;
  meals: string;
  priceUsd: string;
  order: string;
  /** Static path fallback, e.g. /gallery/... */
  imageUrl: string;
  /** Newly uploaded storage id (pending save) */
  pendingStorageId?: Id<"_storage">;
  /** Local object URL for immediate preview after pick */
  localPreviewUrl?: string;
  clearImageStorage: boolean;
  badge: string;
  active: boolean;
};

const emptyDraft = (): PackageDraft => ({
  label: "",
  dateLabel: "",
  timeRange: "",
  sitesText: "",
  meals: "",
  priceUsd: "40",
  order: "10",
  imageUrl: "",
  clearImageStorage: false,
  badge: "",
  active: true,
});

function draftFromPackage(pkg: TourPackageAdmin): PackageDraft {
  const staticPath =
    pkg.imageUrl && pkg.imageUrl.startsWith("/") ? pkg.imageUrl : "";
  return {
    label: pkg.label,
    dateLabel: pkg.dateLabel,
    timeRange: pkg.timeRange,
    sitesText: pkg.sites.join("\n"),
    meals: pkg.meals,
    priceUsd: String(pkg.priceUsd),
    order: String(pkg.order),
    imageUrl: staticPath,
    clearImageStorage: false,
    badge: pkg.badge ?? "",
    active: pkg.active,
  };
}

function parseDraft(draft: PackageDraft) {
  return {
    label: draft.label.trim(),
    dateLabel: draft.dateLabel.trim(),
    timeRange: draft.timeRange.trim(),
    sites: draft.sitesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    meals: draft.meals.trim(),
    priceUsd: Number(draft.priceUsd),
    order: Number(draft.order),
    imageUrl: draft.imageUrl.trim() || undefined,
    imageStorageId: draft.pendingStorageId,
    clearImageStorage: draft.clearImageStorage || undefined,
    badge: draft.badge.trim() || undefined,
    active: draft.active,
  };
}

function PackageImageField({
  draft,
  savedPkg,
  idPrefix,
  onChange,
  onUpload,
  uploading,
}: {
  draft: PackageDraft;
  savedPkg?: TourPackageAdmin;
  idPrefix: string;
  onChange: (next: PackageDraft) => void;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSrc = draft.clearImageStorage
    ? draft.imageUrl.trim() || null
    : draft.localPreviewUrl ||
      (savedPkg && !draft.pendingStorageId
        ? resolveTourImage(savedPkg)
        : null) ||
      draft.imageUrl.trim() ||
      null;

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Card image</Label>
        <p className="text-xs text-muted-foreground">
          Recommended 4:3 landscape for tour cards
        </p>
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
        {previewSrc ? (
          <Image
            src={previewSrc}
            alt="Tour card preview"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            unoptimized={previewSrc.startsWith("blob:")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No image yet
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlusIcon className="size-3.5" />
          {uploading ? "Uploading…" : "Upload image"}
        </Button>
        {previewSrc || savedPkg?.imageStorageId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={uploading}
            onClick={() => {
              if (draft.localPreviewUrl) {
                URL.revokeObjectURL(draft.localPreviewUrl);
              }
              onChange({
                ...draft,
                pendingStorageId: undefined,
                localPreviewUrl: undefined,
                clearImageStorage: true,
                imageUrl: "",
              });
            }}
          >
            <Trash2Icon className="size-3.5" />
            Remove image
          </Button>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-image-path`}>
          Or use a site path (optional)
        </Label>
        <Input
          id={`${idPrefix}-image-path`}
          value={draft.imageUrl}
          onChange={(e) =>
            onChange({
              ...draft,
              imageUrl: e.target.value,
              clearImageStorage: draft.clearImageStorage,
            })
          }
          placeholder="/gallery/2025/homecoming-02.jpg"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Uploaded images take priority over a path when both are set.
        </p>
      </div>
    </div>
  );
}

function PackageFormFields({
  draft,
  onChange,
  idPrefix,
  savedPkg,
  onUpload,
  uploading,
}: {
  draft: PackageDraft;
  onChange: (next: PackageDraft) => void;
  idPrefix: string;
  savedPkg?: TourPackageAdmin;
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}) {
  return (
    <div className="space-y-3">
      <PackageImageField
        draft={draft}
        savedPkg={savedPkg}
        idPrefix={idPrefix}
        onChange={onChange}
        onUpload={onUpload}
        uploading={uploading}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-label`}>Label</Label>
          <Input
            id={`${idPrefix}-label`}
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder="Package 1"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-date`}>Date</Label>
          <Input
            id={`${idPrefix}-date`}
            value={draft.dateLabel}
            onChange={(e) => onChange({ ...draft, dateLabel: e.target.value })}
            placeholder="Saturday, October 31st"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-time`}>Time range</Label>
          <Input
            id={`${idPrefix}-time`}
            value={draft.timeRange}
            onChange={(e) => onChange({ ...draft, timeRange: e.target.value })}
            placeholder="8:00 AM – 6:00 PM"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-meals`}>Meals</Label>
          <Input
            id={`${idPrefix}-meals`}
            value={draft.meals}
            onChange={(e) => onChange({ ...draft, meals: e.target.value })}
            placeholder="Breakfast snack & Lunch"
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-sites`}>Sites (one per line)</Label>
        <Textarea
          id={`${idPrefix}-sites`}
          rows={5}
          value={draft.sitesText}
          onChange={(e) => onChange({ ...draft, sitesText: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-badge`}>Badge (optional)</Label>
        <Input
          id={`${idPrefix}-badge`}
          value={draft.badge}
          onChange={(e) => onChange({ ...draft, badge: e.target.value })}
          placeholder="Full day"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`${idPrefix}-price`}>Price (USD)</Label>
          <Input
            id={`${idPrefix}-price`}
            type="number"
            min={0}
            step="1"
            value={draft.priceUsd}
            onChange={(e) => onChange({ ...draft, priceUsd: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-order`}>Display order</Label>
          <Input
            id={`${idPrefix}-order`}
            type="number"
            min={0}
            value={draft.order}
            onChange={(e) => onChange({ ...draft, order: e.target.value })}
          />
        </div>
        <div className="flex items-end pb-2">
          <Label className="flex items-center gap-2">
            <Checkbox
              checked={draft.active}
              onCheckedChange={(checked) =>
                onChange({ ...draft, active: checked === true })
              }
            />
            <span>Active (shown on /tours)</span>
          </Label>
        </div>
      </div>
    </div>
  );
}

export function TourPackageManager() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "registration");
  const packages = useQuery(
    api.tourPackages.listAdmin,
    allowed ? sessionArgs : "skip",
  ) as TourPackageAdmin[] | undefined;
  const ensureDefaults = useMutation(api.tourPackages.ensureDefaults);
  const createPackage = useMutation(api.tourPackages.create);
  const updatePackage = useMutation(api.tourPackages.update);
  const removePackage = useMutation(api.tourPackages.remove);
  const generateUploadUrl = useMutation(api.tourPackages.generateUploadUrl);

  const [drafts, setDrafts] = useState<Record<string, PackageDraft>>({});
  const [newDraft, setNewDraft] = useState(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [autoSeedAttempted, setAutoSeedAttempted] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken || packages === undefined || autoSeedAttempted) {
      return;
    }
    setAutoSeedAttempted(true);
    void ensureDefaults({ sessionToken })
      .then((result) => {
        if (result.inserted > 0) {
          toast.success(`Loaded ${result.inserted} default tour packages`);
        }
      })
      .catch(() => {
        /* manual seed button remains available */
      });
  }, [sessionToken, packages, autoSeedAttempted, ensureDefaults]);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to tour packages.
      </p>
    );
  }

  const getDraft = (pkg: TourPackageAdmin) =>
    drafts[pkg._id] ?? draftFromPackage(pkg);

  const uploadForDraft = async (
    key: string,
    file: File,
    draft: PackageDraft,
    setDraft: (next: PackageDraft) => void,
  ) => {
    if (!sessionToken) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploadingKey(key);
    try {
      const localPreviewUrl = URL.createObjectURL(file);
      if (draft.localPreviewUrl) {
        URL.revokeObjectURL(draft.localPreviewUrl);
      }
      const storageId = await uploadFileToConvex(file, () =>
        generateUploadUrl({ sessionToken }),
      );
      setDraft({
        ...draft,
        pendingStorageId: storageId,
        localPreviewUrl,
        clearImageStorage: false,
      });
      toast.success("Image uploaded — save the package to apply");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const seedDefaults = async () => {
    if (!sessionToken) return;
    setSeeding(true);
    try {
      const result = await ensureDefaults({ sessionToken });
      toast.success(
        result.inserted > 0
          ? `Added ${result.inserted} default package(s)`
          : "Default packages already present",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const save = async (id: Id<"tourPackages">) => {
    if (!sessionToken || !packages) return;
    const pkg = packages.find((p) => p._id === id);
    if (!pkg) return;
    const draft = getDraft(pkg);
    const parsed = parseDraft(draft);
    setSavingId(id);
    try {
      await updatePackage({ sessionToken, id, ...parsed });
      if (draft.localPreviewUrl) {
        URL.revokeObjectURL(draft.localPreviewUrl);
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.success(`Updated ${parsed.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const create = async () => {
    if (!sessionToken) return;
    const parsed = parseDraft(newDraft);
    setCreating(true);
    try {
      await createPackage({ sessionToken, ...parsed });
      if (newDraft.localPreviewUrl) {
        URL.revokeObjectURL(newDraft.localPreviewUrl);
      }
      setNewDraft(emptyDraft());
      toast.success(`Created ${parsed.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: Id<"tourPackages">, label: string) => {
    if (!sessionToken) return;
    if (
      !window.confirm(`Delete tour package “${label}”? This cannot be undone.`)
    ) {
      return;
    }
    try {
      await removePackage({ sessionToken, id });
      toast.success(`Deleted ${label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Edit packages shown on the public Tours page. Upload a card image
          (4:3 works best) or keep a site path.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void seedDefaults()}
          disabled={seeding}
        >
          {seeding ? "Seeding…" : "Seed default packages"}
        </Button>
      </div>

      {packages === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {packages.map((pkg) => {
            const draft = getDraft(pkg);
            return (
              <Card key={pkg._id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">{pkg.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      slug: {pkg.slug} · {pkg.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void remove(pkg._id, pkg.label)}
                  >
                    Delete
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PackageFormFields
                    idPrefix={pkg._id}
                    draft={draft}
                    savedPkg={pkg}
                    uploading={uploadingKey === pkg._id}
                    onChange={(next) =>
                      setDrafts((current) => ({ ...current, [pkg._id]: next }))
                    }
                    onUpload={(file) =>
                      uploadForDraft(pkg._id, file, draft, (next) =>
                        setDrafts((current) => ({
                          ...current,
                          [pkg._id]: next,
                        })),
                      )
                    }
                  />
                  <Button
                    onClick={() => void save(pkg._id)}
                    disabled={savingId === pkg._id || uploadingKey === pkg._id}
                  >
                    {savingId === pkg._id ? "Saving…" : "Save changes"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add tour package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PackageFormFields
            idPrefix="new"
            draft={newDraft}
            uploading={uploadingKey === "new"}
            onChange={setNewDraft}
            onUpload={(file) =>
              uploadForDraft("new", file, newDraft, setNewDraft)
            }
          />
          <Button
            onClick={() => void create()}
            disabled={creating || uploadingKey === "new"}
          >
            {creating ? "Creating…" : "Create package"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
