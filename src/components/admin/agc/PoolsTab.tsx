"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatTile } from "@/components/portal/StatTile";
import { cn } from "@/lib/utils";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";

type PoolRow = {
  _id: string;
  accommodationType: string;
  scope: string;
  total: number;
  reserved: number;
  confirmed: number;
  available: number;
};

export function PoolsTab() {
  const { sessionToken } = useAdminSession();
  const pools = useQuery(
    api.agcAdminData.listPoolsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const reallocate = useMutation(api.agcAdminData.reallocatePool);
  const [form, setForm] = useState({
    accommodationType: "dormitory",
    fromScope: "africa",
    toScope: "rest_of_world",
    quantity: "10",
  });

  const handleReallocate = async () => {
    if (!sessionToken) return;
    try {
      await reallocate({
        sessionToken,
        accommodationType: form.accommodationType as
          | "dormitory"
          | "hostel"
          | "wise_serpents"
          | "good_general"
          | "ebpv",
        fromScope: form.fromScope as "africa" | "rest_of_world" | "global",
        toScope: form.toScope as "africa" | "rest_of_world" | "global",
        quantity: Number(form.quantity),
      });
      toast.success("Pool reallocation recorded");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Reallocation failed"));
    }
  };

  const list = pools ?? [];
  const totals = list.reduce(
    (acc, p: PoolRow) => ({
      total: acc.total + p.total,
      available: acc.available + p.available,
      held: acc.held + p.reserved,
      confirmed: acc.confirmed + p.confirmed,
    }),
    { total: 0, available: 0, held: 0, confirmed: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total capacity" value={totals.total} />
        <StatTile label="Available" value={totals.available} tone="info" />
        <StatTile label="On hold" value={totals.held} tone="warning" />
        <StatTile label="Confirmed" value={totals.confirmed} tone="positive" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((pool: PoolRow) => {
          const taken = pool.reserved + pool.confirmed;
          const pct = pool.total > 0 ? Math.round((taken / pool.total) * 100) : 0;
          const barTone =
            pool.available <= 0
              ? "bg-rose-500"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <div key={pool._id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {AGC_ACCOMMODATION_LABELS[pool.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS] ?? pool.accommodationType}
                </p>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {pool.scope.replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", barTone)} style={{ width: pct + "%" }} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <div>
                  <p className="text-sm font-semibold tabular-nums">{pool.available}</p>
                  <p className="text-[10px] text-muted-foreground">left</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">{pool.reserved}</p>
                  <p className="text-[10px] text-muted-foreground">held</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{pool.confirmed}</p>
                  <p className="text-[10px] text-muted-foreground">confirmed</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums">{pool.total}</p>
                  <p className="text-[10px] text-muted-foreground">total</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reallocation — moves capacity between regional pools (audited). */}
      <div className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            value={form.accommodationType}
            onValueChange={(value) =>
              setForm({
                ...form,
                accommodationType: (value ?? form.accommodationType) as typeof form.accommodationType,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dormitory">Dormitory</SelectItem>
              <SelectItem value="hostel">Hostel</SelectItem>
              <SelectItem value="wise_serpents">Wise as Serpents</SelectItem>
              <SelectItem value="good_general">Good General Lodge</SelectItem>
              <SelectItem value="ebpv">EBPV</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>From scope</Label>
          <Select
            value={form.fromScope}
            onValueChange={(value) =>
              setForm({ ...form, fromScope: (value ?? form.fromScope) as typeof form.fromScope })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="africa">Africa</SelectItem>
              <SelectItem value="rest_of_world">Rest of world</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>To scope</Label>
          <Select
            value={form.toScope}
            onValueChange={(value) =>
              setForm({ ...form, toScope: (value ?? form.toScope) as typeof form.toScope })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rest_of_world">Rest of world</SelectItem>
              <SelectItem value="africa">Africa</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantity</Label>
          <Input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={() => void handleReallocate()}
            className="h-10 w-full"
          >
            Reallocate
          </Button>
        </div>
      </div>
    </div>
  );
}
