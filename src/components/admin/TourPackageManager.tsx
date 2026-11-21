"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";

import { useRef, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import {
  ImagePlusIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { EmptyState } from "@/components/admin/kit/EmptyState";
import { cn } from "@/lib/utils";
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
  priceGhs: string;
  order: string;
  /** Static path fallback, e.g. /gallery/... */
  imageUrl: string;
  /** Newly uploaded storage id (pending save) */
  pendingStorageId?: Id<"_storage">;
  /** Local object URL for immediate preview after pick */
  localPreviewUrl?: string;
  clearImageStorage: boolean;
  badge: string;
  /** datetime-local value ("" when unset) — stored as epoch ms. */
  startsAt: string;
  departurePoint: string;
  notIncludedText: string;
  active: boolean;
};

const emptyDraft = (): PackageDraft => ({
  label: "",
  dateLabel: "",
  timeRange: "",
  sitesText: "",
  meals: "",
  priceUsd: "40",
  priceGhs: "600",
  order: "10",
  imageUrl: "",
  clearImageStorage: false,
  badge: "",
  startsAt: "",
  departurePoint: "",
  notIncludedText: "",
  active: true,
});

/** epoch ms → the `YYYY-MM-DDTHH:mm` value a datetime-local input expects. */
function toDatetimeLocalValue(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
    priceGhs: pkg.priceGhs != null ? String(pkg.priceGhs) : "",
    order: String(pkg.order),
    imageUrl: staticPath,
    clearImageStorage: false,
    badge: pkg.badge ?? "",
    startsAt: toDatetimeLocalValue(pkg.startsAt),
    departurePoint: pkg.departurePoint ?? "",
    notIncludedText: (pkg.notIncluded ?? []).join("\n"),
    active: pkg.active,
  };
}

function parseDraft(draft: PackageDraft) {
  const priceGhsRaw = draft.priceGhs.trim();
  const priceGhs =
    priceGhsRaw === ""
      ? undefined
      : Number.isFinite(Number(priceGhsRaw))
        ? Number(priceGhsRaw)
        : undefined;

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
    priceGhs,
    order: Number(draft.order),
    imageUrl: draft.imageUrl.trim() || undefined,
    imageStorageId: draft.pendingStorageId,
    clearImageStorage: draft.clearImageStorage || undefined,
    badge: draft.badge.trim() || undefined,
    startsAt: draft.startsAt
      ? new Date(draft.startsAt).getTime()
      : undefined,
    departurePoint: draft.departurePoint.trim() || undefined,
    notIncluded: draft.notIncludedText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
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
          Cover thumbnail on /tours — 4:3 crops best
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
            placeholder="Accra Tours"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-date`}>Date</Label>
          <Input
            id={`${idPrefix}-date`}
            value={draft.dateLabel}
            onChange={(e) => onChange({ ...draft, dateLabel: e.target.value })}
            placeholder="Monday, November 1st"
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-starts-at`}>
            Tour date &amp; start time (optional)
          </Label>
          <Input
            id={`${idPrefix}-starts-at`}
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => onChange({ ...draft, startsAt: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Sorts the public page and drives the day chip. “Date” above stays
            the wording people read.
          </p>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-departure`}>
            Departure point (optional)
          </Label>
          <Input
            id={`${idPrefix}-departure`}
            value={draft.departurePoint}
            onChange={(e) =>
              onChange({ ...draft, departurePoint: e.target.value })
            }
            placeholder="Anagkazo Campus main gate, 6:30 AM"
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-not-included`}>
          Not included (one per line, optional)
        </Label>
        <Textarea
          id={`${idPrefix}-not-included`}
          rows={3}
          value={draft.notIncludedText}
          onChange={(e) =>
            onChange({ ...draft, notIncludedText: e.target.value })
          }
          placeholder="Library of the Anointed tours"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Label htmlFor={`${idPrefix}-price-ghs`}>Price (GHS)</Label>
          <Input
            id={`${idPrefix}-price-ghs`}
            type="number"
            min={0}
            step="1"
            value={draft.priceGhs}
            onChange={(e) => onChange({ ...draft, priceGhs: e.target.value })}
            placeholder="600"
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

  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"tourPackages">;
    label: string;
  } | null>(null);
  /** Which package the side sheet is editing: an id, "new", or closed. */
  const [editor, setEditor] = useState<Id<"tourPackages"> | "new" | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PackageDraft>>({});
  const [newDraft, setNewDraft] = useState(emptyDraft);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

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
      toast.error(...toastFriendlyErrorParts(err, "Upload failed"));
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
          ? `Added ${result.inserted} missing tour package(s)`
          : "No default tour was missing — nothing changed",
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Seed failed"));
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
      return true;
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Update failed"));
      return false;
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
      return true;
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Create failed"));
      return false;
    } finally {
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await removePackage({ sessionToken, id: deleteTarget.id });
      toast.success(`Deleted ${deleteTarget.label}`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  const editingPkg =
    editor && editor !== "new"
      ? packages?.find((pkg) => pkg._id === editor)
      : undefined;
  const closeEditor = () => setEditor(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Changes go live on the public Tours page immediately.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void seedDefaults()}
            disabled={seeding}
            title="Re-adds any default tour that is missing. Never edits or deletes an existing package."
          >
            {seeding ? "Checking…" : "Add missing tours"}
          </Button>
          <Button size="sm" onClick={() => setEditor("new")}>
            <PlusIcon className="size-4" /> Add package
          </Button>
        </div>
      </div>

      {packages === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No tour packages yet"
          action={
            <Button size="sm" onClick={() => setEditor("new")}>
              <PlusIcon className="size-4" /> Add package
            </Button>
          }
        />
      ) : (
        <div className="admin-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <div
              key={pkg._id}
              className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft transition-shadow duration-300 hover:shadow-elevate"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                {pkg.imageUrl ? (
                  <Image
                    src={pkg.imageUrl}
                    alt={pkg.label}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    unoptimized={pkg.imageUrl.startsWith("http")}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <MapIcon className="size-6" />
                  </div>
                )}
                <span
                  className={cn(
                    "absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-medium shadow",
                    pkg.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {pkg.active ? "Active" : "Hidden"}
                </span>
                {pkg.badge ? (
                  <span className="absolute top-2 right-2 rounded-full bg-gradient-to-br from-gold-light to-gold px-2.5 py-0.5 text-xs font-semibold text-[#2b1b12] shadow">
                    {pkg.badge}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{pkg.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[pkg.dateLabel, pkg.timeRange].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  US${pkg.priceUsd}
                  {pkg.priceGhs != null ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      GH₵{pkg.priceGhs}
                    </span>
                  ) : null}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {pkg.sites.join(" · ")}
                </p>
                <div className="mt-auto flex justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget({ id: pkg._id, label: pkg.label })}
                  >
                    <Trash2Icon className="size-3.5" /> Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditor(pkg._id)}>
                    <PencilIcon className="size-3.5" /> Edit
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {editor === "new" ? "Add tour package" : "Edit tour package"}
            </SheetTitle>
            <SheetDescription>
              {editingPkg ? editingPkg.label : "Live on the Tours page once saved."}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            {editor === "new" ? (
              <PackageFormFields
                idPrefix="new"
                draft={newDraft}
                uploading={uploadingKey === "new"}
                onChange={setNewDraft}
                onUpload={(file) => uploadForDraft("new", file, newDraft, setNewDraft)}
              />
            ) : editingPkg ? (
              <PackageFormFields
                idPrefix={editingPkg._id}
                draft={getDraft(editingPkg)}
                savedPkg={editingPkg}
                uploading={uploadingKey === editingPkg._id}
                onChange={(next) =>
                  setDrafts((current) => ({ ...current, [editingPkg._id]: next }))
                }
                onUpload={(file) =>
                  uploadForDraft(editingPkg._id, file, getDraft(editingPkg), (next) =>
                    setDrafts((current) => ({ ...current, [editingPkg._id]: next })),
                  )
                }
              />
            ) : null}
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            {editor === "new" ? (
              <Button
                onClick={async () => {
                  if (await create()) closeEditor();
                }}
                disabled={creating || uploadingKey === "new"}
              >
                {creating ? "Creating…" : "Create package"}
              </Button>
            ) : editingPkg ? (
              <Button
                onClick={async () => {
                  if (await save(editingPkg._id)) closeEditor();
                }}
                disabled={savingId === editingPkg._id || uploadingKey === editingPkg._id}
              >
                {savingId === editingPkg._id ? "Saving…" : "Save changes"}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete tour package?"
        description={`“${deleteTarget?.label ?? "This package"}” will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete package"
        loading={deleting}
        onConfirm={remove}
      />
    </div>
  );
}
