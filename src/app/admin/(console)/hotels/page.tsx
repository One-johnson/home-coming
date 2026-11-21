"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Hotel,
  MapPin,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { EmptyState } from "@/components/admin/kit/EmptyState";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { canAccessArea } from "@/lib/adminRoles";

type HotelDraft = {
  name: string;
  contact: string;
  rate: string;
  distance: string;
  instructions: string;
  discountCode: string;
};

function toDraft(hotel: Doc<"hotels">): HotelDraft {
  return {
    name: hotel.name,
    contact: hotel.contact ?? "",
    rate: hotel.rate ?? "",
    distance: hotel.distance ?? "",
    instructions: hotel.instructions ?? "",
    discountCode: hotel.discountCode ?? "",
  };
}

/**
 * Preferred hotels: a compact, ordered list. Reorder with the arrows, edit in
 * a side sheet — no wall of always-open forms.
 */
export default function AdminHotelsPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "accommodation");
  const hotels = useQuery(
    api.content.listHotelsAdmin,
    allowed ? sessionArgs : "skip",
  );
  const syncHotels = useMutation(api.content.syncHotels);
  const updateHotel = useMutation(api.content.updateHotel);
  const [draft, setDraft] = useState<HotelDraft | null>(null);
  const [editingId, setEditingId] = useState<Id<"hotels"> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const sortedHotels = useMemo(
    () => [...(hotels ?? [])].sort((a, b) => a.order - b.order),
    [hotels],
  );

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to preferred hotels.
      </p>
    );
  }

  const save = (hotel: Doc<"hotels">, values: HotelDraft, order: number) =>
    updateHotel({
      sessionToken: sessionToken!,
      id: hotel._id,
      name: values.name,
      contact: values.contact || undefined,
      rate: values.rate || undefined,
      distance: values.distance || undefined,
      instructions: values.instructions || undefined,
      discountCode: values.discountCode || undefined,
      order,
    });

  const handleSync = async () => {
    if (!sessionToken) return;
    setSyncing(true);
    try {
      const result = await syncHotels({ sessionToken });
      toast.success(
        `Hotels synced (${result.inserted} new, ${result.updated} updated, ${result.deleted} removed)`,
      );
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const editing = sortedHotels.find((hotel) => hotel._id === editingId);

  const openEditor = (hotel: Doc<"hotels">) => {
    setEditingId(hotel._id);
    setDraft(toDraft(hotel));
  };

  const handleSave = async () => {
    if (!sessionToken || !editing || !draft) return;
    if (!draft.name.trim()) {
      toast.error("A hotel needs a name");
      return;
    }
    setBusy(true);
    try {
      await save(editing, draft, editing.order);
      toast.success(`Updated ${draft.name}`);
      setEditingId(null);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Update failed");
    } finally {
      setBusy(false);
    }
  };

  /** Swap a hotel with its neighbour — replaces typing order numbers. */
  const move = async (index: number, delta: -1 | 1) => {
    if (!sessionToken) return;
    const a = sortedHotels[index];
    const b = sortedHotels[index + delta];
    if (!a || !b) return;
    setBusy(true);
    try {
      // Write list positions, not the stored values, which can collide.
      await save(a, toDraft(a), index + delta);
      await save(b, toDraft(b), index);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Reorder failed");
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: keyof HotelDraft,
    label: string,
    options: { textarea?: boolean; wide?: boolean } = {},
  ) =>
    draft ? (
      <div className={options.wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
        <Label htmlFor={`hotel-${key}`}>{label}</Label>
        {options.textarea ? (
          <Textarea
            id={`hotel-${key}`}
            rows={4}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        ) : (
          <Input
            id={`hotel-${key}`}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        )}
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        description="Preferred hotels near campus, in the order the public page lists them."
        actions={
          <Button
            variant="outline"
            onClick={() => void handleSync()}
            disabled={syncing}
            title="Re-import the hotels from the PDF seed list"
          >
            <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
            {syncing ? "Syncing…" : "Sync from PDF seed"}
          </Button>
        }
      />

      {hotels === undefined ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : sortedHotels.length === 0 ? (
        <EmptyState
          icon={Hotel}
          title="No hotels yet"
          description="Import the preferred hotels from the PDF seed list."
          action={
            <Button onClick={() => void handleSync()} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync hotels now"}
            </Button>
          }
        />
      ) : (
        <ul className="admin-stagger space-y-2">
          {sortedHotels.map((hotel, index) => (
            <li
              key={hotel._id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-soft transition-shadow duration-300 hover:shadow-elevate"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-sm font-semibold text-gold-dark">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{hotel.name}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {hotel.distance && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" /> {hotel.distance}
                    </span>
                  )}
                  {hotel.rate && <span>{hotel.rate}</span>}
                  {hotel.contact && (
                    <span className="truncate">{hotel.contact}</span>
                  )}
                </p>
              </div>
              {hotel.discountCode && (
                <Badge
                  variant="outline"
                  className="border-gold/40 bg-gold/10 font-mono text-gold-dark"
                >
                  {hotel.discountCode}
                </Badge>
              )}
              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${hotel.name} up`}
                  disabled={index === 0 || busy}
                  onClick={() => void move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${hotel.name} down`}
                  disabled={index === sortedHotels.length - 1 || busy}
                  onClick={() => void move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditor(hotel)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit hotel</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4 sm:grid-cols-2">
            {field("name", "Name", { wide: true })}
            {field("distance", "Location")}
            {field("rate", "Rate")}
            {field("contact", "Contact", { wide: true })}
            {field("instructions", "Rooms & capacity", {
              textarea: true,
              wide: true,
            })}
            {field("discountCode", "Discount code")}
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
