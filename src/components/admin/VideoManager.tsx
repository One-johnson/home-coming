"use client";

import { useMutation, useQuery } from "convex/react";
import { LayoutGrid, MoreHorizontal, Pencil, Table2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  createActionsColumn,
  messageColumns,
  messageExportRow,
} from "@/components/admin/columns";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { mediaTypeBadgeClass } from "@/lib/adminColors";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

type MediaType = "audio" | "video" | "message";
type ViewMode = "table" | "card";

type VideoRow = {
  key: string;
  year: number;
  title: string;
  speaker: string;
  mediaType: MediaType;
  url: string;
  order: number;
};

const DEFAULT_SPEAKER = "Dag Heward-Mills";
/** Widened so `as const` on EVENT cannot pin form state to literal `2025`. */
const DEFAULT_YEAR: number = EVENT.lastHomecomingYear;

function newVideoRow(order: number, defaults?: Partial<VideoRow>): VideoRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    year: defaults?.year ?? DEFAULT_YEAR,
    title: defaults?.title ?? "",
    speaker: defaults?.speaker ?? DEFAULT_SPEAKER,
    mediaType: defaults?.mediaType ?? "video",
    url: defaults?.url ?? "",
    order,
  };
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

/** One URL per line, or `Title | https://…`. */
function parsePasteLines(text: string): { title: string; url: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pipeIdx = line.indexOf("|");
      if (pipeIdx > 0) {
        const left = line.slice(0, pipeIdx).trim();
        const right = line.slice(pipeIdx + 1).trim();
        if (looksLikeUrl(right) && !looksLikeUrl(left)) {
          return { title: left, url: right };
        }
      }
      return { title: "", url: line };
    });
}

function parseCsvField(raw: string) {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      fields.push(parseCsvField(current));
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(parseCsvField(current));
  return fields;
}

function normalizeMediaType(value: string): MediaType {
  const normalized = value.trim().toLowerCase();
  if (normalized === "audio" || normalized === "message") return normalized;
  return "video";
}

/** CSV headers: year,title,speaker,mediaType,url,order (order optional). */
function parseVideoCsv(text: string): Omit<VideoRow, "key">[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one data row");
  }

  const headers = splitCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase(),
  );
  const indexOf = (name: string) => headers.indexOf(name);
  const required = ["title", "url"] as const;
  for (const name of required) {
    if (indexOf(name) < 0) {
      throw new Error(`CSV is missing a "${name}" column`);
    }
  }

  const yearIdx = indexOf("year");
  const titleIdx = indexOf("title");
  const speakerIdx = indexOf("speaker");
  const mediaTypeIdx = indexOf("mediatype");
  const urlIdx = indexOf("url");
  const orderIdx = indexOf("order");

  return lines.slice(1).map((line, index) => {
    const cols = splitCsvLine(line);
    const title = cols[titleIdx]?.trim() ?? "";
    const url = cols[urlIdx]?.trim() ?? "";
    if (!title || !url) {
      throw new Error(`Row ${index + 2} needs both title and url`);
    }
    if (!looksLikeUrl(url)) {
      throw new Error(`Row ${index + 2} has an invalid url`);
    }

    const yearRaw = yearIdx >= 0 ? cols[yearIdx] : "";
    const orderRaw = orderIdx >= 0 ? cols[orderIdx] : "";
    const year = Number(yearRaw);
    const order = Number(orderRaw);

    return {
      year: Number.isFinite(year) && year > 0 ? year : DEFAULT_YEAR,
      title,
      speaker:
        (speakerIdx >= 0 ? cols[speakerIdx]?.trim() : "") || DEFAULT_SPEAKER,
      mediaType: normalizeMediaType(
        mediaTypeIdx >= 0 ? (cols[mediaTypeIdx] ?? "video") : "video",
      ),
      url,
      order: Number.isFinite(order) && order > 0 ? order : index + 1,
    };
  });
}

function VideoActionsMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function VideoManager() {
  const { sessionToken } = useAdminSession();
  const messages = useQuery(api.content.listMessages);
  const upsertMessage = useMutation(api.content.upsertMessage);
  const bulkCreateMessages = useMutation(api.content.bulkCreateMessages);
  const deleteMessage = useMutation(api.content.deleteMessage);
  const bulkDeleteMessages = useMutation(api.content.bulkDeleteMessages);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [formOpen, setFormOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Id<"messages"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "single"; id: Id<"messages">; title: string }
    | { type: "bulk"; ids: Id<"messages">[]; clearSelection: () => void }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState<{
    year: number;
    title: string;
    speaker: string;
    mediaType: MediaType;
    url: string;
    order: number;
  }>({
    year: DEFAULT_YEAR,
    title: "",
    speaker: DEFAULT_SPEAKER,
    mediaType: "video",
    url: "",
    order: 1,
  });
  const [videoRows, setVideoRows] = useState<VideoRow[]>([newVideoRow(1)]);
  const [pasteText, setPasteText] = useState("");

  const nextMessageOrder = () =>
    Math.max(0, ...(messages ?? []).map((m) => m.order)) + 1;

  const resetCreateRows = (startingOrder?: number) => {
    const order = startingOrder ?? nextMessageOrder();
    setVideoRows([newVideoRow(order)]);
    setPasteText("");
  };

  useEffect(() => {
    if (!messages || editingMessage) return;
    setVideoRows((rows) => {
      if (
        rows.length !== 1 ||
        rows[0].title ||
        rows[0].url ||
        rows[0].order !== 1
      ) {
        return rows;
      }
      const nextOrder = Math.max(0, ...messages.map((m) => m.order)) + 1;
      return rows[0].order === nextOrder
        ? rows
        : [{ ...rows[0], order: nextOrder }];
    });
  }, [messages, editingMessage]);

  const sortedMessages = useMemo(
    () =>
      [...(messages ?? [])].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return a.order - b.order;
      }),
    [messages],
  );

  const yearOptions = useMemo(() => {
    const years = new Set(sortedMessages.map((m) => String(m.year)));
    return [...years]
      .sort((a, b) => Number(b) - Number(a))
      .map((value) => ({ label: value, value }));
  }, [sortedMessages]);

  const startEditMessage = (message: Doc<"messages">) => {
    setEditingMessage(message._id);
    setEditForm({
      year: message.year,
      title: message.title,
      speaker: message.speaker,
      mediaType: message.mediaType,
      url: message.url,
      order: message.order,
    });
    setFormOpen(true);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    resetCreateRows();
    setFormOpen(false);
  };

  const updateVideoRow = (key: string, patch: Partial<VideoRow>) => {
    setVideoRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  };

  const addVideoRow = () => {
    setVideoRows((rows) => {
      const last = rows[rows.length - 1];
      return [
        ...rows,
        newVideoRow((last?.order ?? nextMessageOrder() - 1) + 1, {
          year: last?.year,
          speaker: last?.speaker,
          mediaType: last?.mediaType,
        }),
      ];
    });
  };

  const removeVideoRow = (key: string) => {
    setVideoRows((rows) =>
      rows.length <= 1 ? rows : rows.filter((row) => row.key !== key),
    );
  };

  const applyPasteToRows = () => {
    const parsed = parsePasteLines(pasteText);
    if (parsed.length === 0) {
      toast.error("Paste at least one URL");
      return;
    }
    if (parsed.some((item) => !looksLikeUrl(item.url))) {
      toast.error("Each line must be a URL (or Title | https://…)");
      return;
    }

    const startOrder = nextMessageOrder();
    const template = videoRows[0];
    setVideoRows(
      parsed.map((item, index) =>
        newVideoRow(startOrder + index, {
          year: template?.year,
          speaker: template?.speaker,
          mediaType: template?.mediaType,
          title: item.title,
          url: item.url,
        }),
      ),
    );
    setPasteText("");
    toast.success(
      `Filled ${parsed.length} row${parsed.length === 1 ? "" : "s"} — edit titles and details as needed`,
    );
  };

  const applyCsvFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseVideoCsv(text);
      const startOrder = nextMessageOrder();
      const template = videoRows[0];
      setVideoRows(
        parsed.map((item, index) =>
          newVideoRow(item.order || startOrder + index, {
            year: item.year || template?.year,
            title: item.title,
            speaker: item.speaker || template?.speaker,
            mediaType: item.mediaType || template?.mediaType,
            url: item.url,
          }),
        ),
      );
      setFormOpen(true);
      toast.success(
        `Imported ${parsed.length} video${parsed.length === 1 ? "" : "s"} from CSV — review and save`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV import failed");
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "single") {
        await deleteMessage({ sessionToken, id: deleteTarget.id });
        toast.success("Video deleted");
        if (editingMessage === deleteTarget.id) cancelEdit();
      } else {
        const result = await bulkDeleteMessages({
          sessionToken,
          ids: deleteTarget.ids,
        });
        toast.success(
          `Deleted ${result.deleted} video${result.deleted === 1 ? "" : "s"}`,
        );
        if (
          editingMessage &&
          deleteTarget.ids.includes(editingMessage)
        ) {
          cancelEdit();
        }
        deleteTarget.clearSelection();
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    ...messageColumns,
    createActionsColumn<Doc<"messages">>((message) => (
      <VideoActionsMenu
        onEdit={() => startEditMessage(message)}
        onDelete={() =>
          setDeleteTarget({
            type: "single",
            id: message._id,
            title: message.title,
          })
        }
      />
    )),
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          !editingMessage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => csvInputRef.current?.click()}
              >
                Import CSV
              </Button>
              <Button
                type="button"
                variant={formOpen ? "outline" : "default"}
                onClick={() => {
                  if (formOpen) {
                    setFormOpen(false);
                    resetCreateRows();
                  } else {
                    resetCreateRows();
                    setFormOpen(true);
                  }
                }}
              >
                {formOpen ? "Close form" : "Add videos"}
              </Button>
            </div>
          ) : undefined
        }
      />

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => void applyCsvFile(e.target.files?.[0] ?? null)}
      />

      {(formOpen || editingMessage) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingMessage
                ? "Edit Homecoming video"
                : "Add Homecoming videos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                try {
                  if (editingMessage) {
                    await upsertMessage({
                      sessionToken,
                      id: editingMessage,
                      ...editForm,
                    });
                    toast.success("Video updated");
                    setEditingMessage(null);
                    resetCreateRows();
                    setFormOpen(false);
                    return;
                  }

                  const items = videoRows.map((row) => ({
                    year: row.year,
                    title: row.title.trim(),
                    speaker: row.speaker.trim(),
                    mediaType: row.mediaType,
                    url: row.url.trim(),
                    order: row.order,
                  }));

                  if (
                    items.some(
                      (item) => !item.title || !item.url || !item.speaker,
                    )
                  ) {
                    toast.error("Each video needs a title, URL, and speaker");
                    return;
                  }
                  if (items.some((item) => !looksLikeUrl(item.url))) {
                    toast.error(
                      "Each video URL must start with http:// or https://",
                    );
                    return;
                  }

                  if (items.length === 1) {
                    await upsertMessage({
                      sessionToken,
                      ...items[0],
                    });
                    toast.success("Video saved");
                  } else {
                    await bulkCreateMessages({
                      sessionToken,
                      items,
                    });
                    toast.success(`${items.length} videos saved`);
                  }

                  resetCreateRows(
                    Math.max(...items.map((item) => item.order)) + 1,
                  );
                  setFormOpen(false);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to save video",
                  );
                }
              }}
            >
              {editingMessage ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Title"
                    required
                    className="md:col-span-2"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm({ ...editForm, title: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Video / media URL (Rumble, YouTube, or any link)"
                    required
                    type="url"
                    className="md:col-span-2"
                    value={editForm.url}
                    onChange={(e) =>
                      setEditForm({ ...editForm, url: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Speaker"
                    required
                    value={editForm.speaker}
                    onChange={(e) =>
                      setEditForm({ ...editForm, speaker: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Year"
                    required
                    value={editForm.year}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        year: Number(e.target.value),
                      })
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Order"
                    required
                    value={editForm.order}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        order: Number(e.target.value),
                      })
                    }
                  />
                  <Select
                    value={editForm.mediaType}
                    onValueChange={(value) =>
                      setEditForm({
                        ...editForm,
                        mediaType: (value ?? "video") as MediaType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Media type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="message">Message</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button type="submit">Update video</Button>
                    <Button type="button" variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                    <p className="text-sm font-medium">Quick paste (optional)</p>
                    <Textarea
                      placeholder={
                        "Paste URLs to create rows, one per line.\nOptional: Title | https://…"
                      }
                      rows={3}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={applyPasteToRows}
                        disabled={!pasteText.trim()}
                      >
                        Apply paste to rows
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => csvInputRef.current?.click()}
                      >
                        Import CSV
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      CSV columns: year, title, speaker, mediaType, url, order
                      (order optional).
                    </p>
                  </div>

                  <div className="space-y-4">
                    {videoRows.map((row, index) => (
                      <div
                        key={row.key}
                        className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2"
                      >
                        <div className="flex items-center justify-between gap-2 md:col-span-2">
                          <p className="text-sm font-medium">
                            Video {index + 1}
                          </p>
                          {videoRows.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => removeVideoRow(row.key)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                        <Input
                          placeholder="Title"
                          required
                          className="md:col-span-2"
                          value={row.title}
                          onChange={(e) =>
                            updateVideoRow(row.key, { title: e.target.value })
                          }
                        />
                        <Input
                          placeholder="Video / media URL"
                          required
                          type="url"
                          className="md:col-span-2"
                          value={row.url}
                          onChange={(e) =>
                            updateVideoRow(row.key, { url: e.target.value })
                          }
                        />
                        <Input
                          placeholder="Speaker"
                          required
                          value={row.speaker}
                          onChange={(e) =>
                            updateVideoRow(row.key, {
                              speaker: e.target.value,
                            })
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Year"
                          required
                          value={row.year}
                          onChange={(e) =>
                            updateVideoRow(row.key, {
                              year: Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Order"
                          required
                          value={row.order}
                          onChange={(e) =>
                            updateVideoRow(row.key, {
                              order: Number(e.target.value),
                            })
                          }
                        />
                        <Select
                          value={row.mediaType}
                          onValueChange={(value) =>
                            updateVideoRow(row.key, {
                              mediaType: (value ?? "video") as MediaType,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Media type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="audio">Audio</SelectItem>
                            <SelectItem value="message">Message</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addVideoRow}
                    >
                      Add another video
                    </Button>
                    <Button type="submit">
                      Save {videoRows.length === 1 ? "video" : "videos"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {messages === undefined
              ? "Loading…"
              : `${sortedMessages.length} video${sortedMessages.length === 1 ? "" : "s"}`}
          </p>
          <ToggleGroup
            value={[viewMode]}
            onValueChange={(value) => {
              const next = value[0] as ViewMode | undefined;
              if (next === "table" || next === "card") setViewMode(next);
            }}
            variant="outline"
            size="sm"
            aria-label="Videos view"
          >
            <ToggleGroupItem value="table" aria-label="Table view">
              <Table2 className="size-4" />
              Table
            </ToggleGroupItem>
            <ToggleGroupItem value="card" aria-label="Card view">
              <LayoutGrid className="size-4" />
              Cards
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {viewMode === "table" ? (
          <DataTable
            columns={columns}
            data={sortedMessages}
            isLoading={messages === undefined}
            getRowId={(row) => row._id}
            searchPlaceholder="Search videos…"
            exportFilename="homecoming-videos"
            exportRow={messageExportRow}
            emptyMessage="No videos yet. Use Add videos to get started."
            facetFilters={[
              { columnId: "year", title: "Year", options: yearOptions },
              {
                columnId: "mediaType",
                title: "Type",
                options: [
                  { label: "Video", value: "video" },
                  { label: "Audio", value: "audio" },
                  { label: "Message", value: "message" },
                ],
              },
            ]}
            onRowClick={startEditMessage}
            bulkActions={({ selectedRows, clearSelection }) => (
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setDeleteTarget({
                    type: "bulk",
                    ids: selectedRows.map((row) => row._id),
                    clearSelection,
                  })
                }
              >
                Delete selected
              </Button>
            )}
          />
        ) : (
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
              messages === undefined && "opacity-60",
            )}
          >
            {sortedMessages.map((message) => (
              <div
                key={message._id}
                className="overflow-hidden rounded-lg border border-border"
              >
                {message.thumbnailUrl ? (
                  <div className="aspect-video overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- external CDN hosts vary */}
                    <img
                      src={message.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-gold/30 bg-gold/10 text-gold-dark"
                      >
                        {message.year}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          mediaTypeBadgeClass(message.mediaType),
                        )}
                      >
                        {message.mediaType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Order {message.order}
                      </span>
                    </div>
                    <VideoActionsMenu
                      onEdit={() => startEditMessage(message)}
                      onDelete={() =>
                        setDeleteTarget({
                          type: "single",
                          id: message._id,
                          title: message.title,
                        })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{message.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {message.speaker}
                    </p>
                    <a
                      href={message.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-sm text-primary hover:underline"
                    >
                      {message.url}
                    </a>
                  </div>
                </div>
              </div>
            ))}
            {messages !== undefined && sortedMessages.length === 0 && (
              <p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                No videos yet. Use Add videos to get started.
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "bulk"
            ? `Delete ${deleteTarget.ids.length} video${deleteTarget.ids.length === 1 ? "" : "s"}?`
            : "Delete video?"
        }
        description={
          deleteTarget?.type === "bulk"
            ? "Selected videos will be permanently removed."
            : `“${deleteTarget?.title ?? "This video"}” will be permanently removed.`
        }
        confirmLabel={
          deleteTarget?.type === "bulk"
            ? `Delete ${deleteTarget.ids.length}`
            : "Delete video"
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
