"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  order: string;
};

function toDraft(hotel: Doc<"hotels">): HotelDraft {
  return {
    name: hotel.name,
    contact: hotel.contact ?? "",
    rate: hotel.rate ?? "",
    distance: hotel.distance ?? "",
    instructions: hotel.instructions ?? "",
    discountCode: hotel.discountCode ?? "",
    order: String(hotel.order),
  };
}

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
  const [drafts, setDrafts] = useState<Record<string, HotelDraft>>({});
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<Id<"hotels"> | null>(null);

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

  const getDraft = (hotel: Doc<"hotels">) => drafts[hotel._id] ?? toDraft(hotel);

  const setDraftField = (
    id: Id<"hotels">,
    field: keyof HotelDraft,
    value: string,
  ) => {
    setDrafts((current) => {
      const hotel = hotels?.find((item) => item._id === id);
      const base = current[id] ?? (hotel ? toDraft(hotel) : null);
      if (!base) return current;
      return { ...current, [id]: { ...base, [field]: value } };
    });
  };

  const handleSync = async () => {
    if (!sessionToken) return;
    setSyncing(true);
    try {
      const result = await syncHotels({ sessionToken });
      setDrafts({});
      toast.success(
        `Hotels synced (${result.inserted} new, ${result.updated} updated, ${result.deleted} removed)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (id: Id<"hotels">) => {
    if (!sessionToken || !hotels) return;
    const hotel = hotels.find((item) => item._id === id);
    if (!hotel) return;
    const draft = getDraft(hotel);
    const order = Number(draft.order);
    if (!Number.isFinite(order)) {
      toast.error("Order must be a number");
      return;
    }

    setSavingId(id);
    try {
      await updateHotel({
        sessionToken,
        id,
        name: draft.name,
        contact: draft.contact || undefined,
        rate: draft.rate || undefined,
        distance: draft.distance || undefined,
        instructions: draft.instructions || undefined,
        discountCode: draft.discountCode || undefined,
        order,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.success(`Updated ${draft.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Preferred commercial hotels near campus. Sync from the Homecoming Hotels PDF seed list, then edit details as needed."
        actions={
          <Button onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from PDF seed"}
          </Button>
        }
      />

      {hotels === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : sortedHotels.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-sm text-muted-foreground">
            <p>No hotels in the database yet.</p>
            <Button onClick={() => void handleSync()} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync hotels now"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedHotels.map((hotel) => {
            const draft = getDraft(hotel);
            return (
              <Card key={hotel._id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{hotel.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`${hotel._id}-name`}>Name</Label>
                      <Input
                        id={`${hotel._id}-name`}
                        value={draft.name}
                        onChange={(e) =>
                          setDraftField(hotel._id, "name", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${hotel._id}-distance`}>Location</Label>
                      <Input
                        id={`${hotel._id}-distance`}
                        value={draft.distance}
                        onChange={(e) =>
                          setDraftField(hotel._id, "distance", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${hotel._id}-rate`}>Rate</Label>
                      <Input
                        id={`${hotel._id}-rate`}
                        value={draft.rate}
                        onChange={(e) =>
                          setDraftField(hotel._id, "rate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`${hotel._id}-contact`}>Contact</Label>
                      <Input
                        id={`${hotel._id}-contact`}
                        value={draft.contact}
                        onChange={(e) =>
                          setDraftField(hotel._id, "contact", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`${hotel._id}-instructions`}>
                        Rooms & capacity
                      </Label>
                      <Textarea
                        id={`${hotel._id}-instructions`}
                        value={draft.instructions}
                        rows={3}
                        onChange={(e) =>
                          setDraftField(
                            hotel._id,
                            "instructions",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${hotel._id}-discount`}>
                        Discount code
                      </Label>
                      <Input
                        id={`${hotel._id}-discount`}
                        value={draft.discountCode}
                        onChange={(e) =>
                          setDraftField(
                            hotel._id,
                            "discountCode",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${hotel._id}-order`}>Order</Label>
                      <Input
                        id={`${hotel._id}-order`}
                        type="number"
                        value={draft.order}
                        onChange={(e) =>
                          setDraftField(hotel._id, "order", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void handleSave(hotel._id)}
                      disabled={savingId === hotel._id}
                    >
                      {savingId === hotel._id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
