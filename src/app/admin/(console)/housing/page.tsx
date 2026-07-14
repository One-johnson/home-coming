"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminHousingPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "accommodation");
  const housing = useQuery(
    api.housing.listHousingAdmin,
    allowed ? sessionArgs : "skip",
  );
  const updateHousing = useMutation(api.housing.updateHousing);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { capacityLimit: string; pricePerStay: string; notes: string }
    >
  >({});

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to housing inventory.
      </p>
    );
  }

  const getDraft = (item: Doc<"housing">) =>
    drafts[item._id] ?? {
      capacityLimit: String(item.capacityLimit),
      pricePerStay: String(item.pricePerStay),
      notes: item.notes,
    };

  const save = async (id: Id<"housing">) => {
    if (!sessionToken || !housing) return;
    const item = housing.find((h) => h._id === id);
    if (!item) return;
    const draft = getDraft(item);
    try {
      await updateHousing({
        sessionToken,
        id,
        capacityLimit: Number(draft.capacityLimit),
        pricePerStay: Number(draft.pricePerStay),
        notes: draft.notes,
      });
      toast.success(`Updated ${item.type}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Housing</h2>
        <p className="text-sm text-muted-foreground">
          Manage capacity, pricing, and notes for each inventory type.
        </p>
      </div>

      {housing === undefined ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : housing.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No housing inventory yet. Seed default content from Overview.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {housing.map((item) => {
            const draft = getDraft(item);
            const remaining = Math.max(0, item.capacityLimit - item.booked);
            return (
              <Card key={item._id}>
                <CardHeader>
                  <CardTitle className="capitalize">{item.type}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {item.booked} booked · {remaining} remaining
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Capacity limit
                    </label>
                    <Input
                      type="number"
                      min={item.booked}
                      value={draft.capacityLimit}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [item._id]: {
                            ...draft,
                            capacityLimit: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Price per stay (USD)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.pricePerStay}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [item._id]: {
                            ...draft,
                            pricePerStay: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Notes
                    </label>
                    <Textarea
                      value={draft.notes}
                      onChange={(e) =>
                        setDrafts({
                          ...drafts,
                          [item._id]: { ...draft, notes: e.target.value },
                        })
                      }
                    />
                  </div>
                  <Button onClick={() => void save(item._id)}>Save</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
