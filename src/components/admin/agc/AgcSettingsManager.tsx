"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2Icon, Plus, Save, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";

type AgcAccommodationTypeRow = {
  type: string;
  label: string;
  unit: "bed";
  maxOccupancy: number;
  poolScope: "regional" | "global";
  pricing: { ghs: number; usd: number };
};

type AgcPoolRow = {
  _id: string;
  accommodationType: string;
  scope: string;
  total: number;
  reserved: number;
  confirmed: number;
  available: number;
};

type AgcSettings = {
  deadline: string;
  holdHours: number;
  registrationBankDetails: string;
  accommodationBankDetails: string;
  titles: string[];
  accommodationTypes: AgcAccommodationTypeRow[];
  bishopRate: { ghs: number; usd: number };
  pools: AgcPoolRow[];
};

type AgcSystemStatus = {
  locked: boolean;
  smtp:
    | { configured: true; host: string; port: number; secure: boolean; from: string }
    | { configured: false };
};

type SettingsDraft = {
  deadline: string; // datetime-local input value
  holdHoursText: string;
  registrationBankDetails: string;
  accommodationBankDetails: string;
  titles: string[];
  typePrices: Record<string, { ghs: string; usd: string }>;
  typeLabels: Record<string, string>;
  bishopGhsText: string;
  bishopUsdText: string;
  poolTotals: Record<string, string>; // pool _id → text
};

/** ISO timestamp → value accepted by <input type="datetime-local"> (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value → ISO timestamp, or null when unparseable. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDraft(settings: AgcSettings): SettingsDraft {
  const typePrices: Record<string, { ghs: string; usd: string }> = {};
  const typeLabels: Record<string, string> = {};
  for (const row of settings.accommodationTypes) {
    typePrices[row.type] = {
      ghs: String(row.pricing.ghs),
      usd: String(row.pricing.usd),
    };
    typeLabels[row.type] = row.label;
  }
  const poolTotals: Record<string, string> = {};
  for (const pool of settings.pools) {
    poolTotals[pool._id] = String(pool.total);
  }
  return {
    deadline: toLocalInput(settings.deadline),
    holdHoursText: String(settings.holdHours),
    registrationBankDetails: settings.registrationBankDetails,
    accommodationBankDetails: settings.accommodationBankDetails,
    titles: [...settings.titles],
    typePrices,
    typeLabels,
    bishopGhsText: String(settings.bishopRate.ghs),
    bishopUsdText: String(settings.bishopRate.usd),
    poolTotals,
  };
}

/** The exact keyword required to arm the lockdown switch. */
const LOCKDOWN_KEYWORD = "LOCKDOWN";

export function AgcSettingsManager() {
  const { sessionToken } = useAdminSession();
  const settings = useQuery(
    api.agcAdminData.getAgcSettings,
    {},
  ) as AgcSettings | undefined;
  const systemStatus = useQuery(
    api.agcAdminData.getAgcSystemStatus,
    sessionToken ? { sessionToken } : "skip",
  ) as AgcSystemStatus | undefined;
  const setSetting = useMutation(api.agcAdminData.setAgcSetting);
  const setPoolTotal = useMutation(api.agcAdminData.setPoolTotal);
  const setLockdown = useMutation(api.agcAdminData.setRegistrationLockdown);
  const [lockdownBusy, setLockdownBusy] = useState(false);
  // Typed-keyword guard: the destructive direction of the toggle opens a
  // confirmation dialog that only arms once the keyword is typed exactly.
  const [lockdownConfirmOpen, setLockdownConfirmOpen] = useState(false);
  const [lockdownConfirmText, setLockdownConfirmText] = useState("");

  const handleLockdownSwitch = () => {
    if (!systemStatus || lockdownBusy) return;
    if (!systemStatus.locked) {
      // Enabling is destructive → require the typed keyword.
      setLockdownConfirmText("");
      setLockdownConfirmOpen(true);
      return;
    }
    void toggleLockdown();
  };

  const toggleLockdown = async () => {
    if (!sessionToken || !systemStatus || lockdownBusy) return;
    const next = !systemStatus.locked;
    setLockdownBusy(true);
    try {
      await setLockdown({ sessionToken, locked: next });
      toast.success(
        next
          ? "Registration lockdown enabled — new registrations and bookings are blocked"
          : "Registration lockdown disabled",
      );
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Failed to update lockdown"),
      );
    } finally {
      setLockdownBusy(false);
    }
  };
  const [saving, setSaving] = useState(false);
  // Local edits keyed to the server snapshot they started from. With no
  // edits yet (or fresh data after a save) the draft derives directly from
  // `settings` — no state-sync effect needed.
  const [edit, setEdit] = useState<{
    source: AgcSettings;
    value: SettingsDraft;
  } | null>(null);

  const draft: SettingsDraft | null =
    edit && settings && edit.source === settings
      ? edit.value
      : settings
        ? toDraft(settings)
        : null;

  if (settings === undefined || draft === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const patch = (partial: Partial<SettingsDraft>) => {
    if (!settings) return;
    const base = edit && edit.source === settings ? edit.value : toDraft(settings);
    setEdit({ source: settings, value: { ...base, ...partial } });
  };

  const holdHours = Number(draft.holdHoursText);
  const deadlineIso = fromLocalInput(draft.deadline);
  const titlesValid = draft.titles.every((t) => t.trim().length > 0);
  const holdValid =
    draft.holdHoursText.trim() !== "" &&
    Number.isFinite(holdHours) &&
    holdHours > 0 &&
    holdHours <= 24 * 30;
  const canSave = Boolean(sessionToken) && !saving && deadlineIso !== null && holdValid && titlesValid;

  const save = async () => {
    if (!sessionToken || !settings || !canSave || saving || deadlineIso === null) return;
    setSaving(true);
    try {
      const current = toDraft(settings);
      const ops: Array<Promise<unknown>> = [];
      if (draft.deadline !== current.deadline && deadlineIso) {
        ops.push(
          setSetting({ sessionToken, key: "deadline", value: deadlineIso }),
        );
      }
      if (Number(current.holdHoursText) !== holdHours) {
        ops.push(
          setSetting({
            sessionToken,
            key: "hold_hours",
            value: String(holdHours),
          }),
        );
      }
      if (draft.registrationBankDetails !== current.registrationBankDetails) {
        ops.push(
          setSetting({
            sessionToken,
            key: "registration_bank_details",
            value: draft.registrationBankDetails,
          }),
        );
      }
      if (draft.accommodationBankDetails !== current.accommodationBankDetails) {
        ops.push(
          setSetting({
            sessionToken,
            key: "accommodation_bank_details",
            value: draft.accommodationBankDetails,
          }),
        );
      }
      const titles = draft.titles.map((t) => t.trim());
      if (JSON.stringify(titles) !== JSON.stringify(current.titles)) {
        ops.push(
          setSetting({
            sessionToken,
            key: "guest_titles",
            value: JSON.stringify(titles),
          }),
        );
      }

      // --- Accommodation prices + labels (full snapshot per key) ---
      const prices: Record<string, { ghs: number; usd: number }> = {};
      const labels: Record<string, string> = {};
      let typesValid = true;
      for (const row of settings.accommodationTypes) {
        const price = draft.typePrices[row.type];
        const label = draft.typeLabels[row.type]?.trim() ?? "";
        const ghs = Number(price?.ghs);
        const usd = Number(price?.usd);
        if (
          !label ||
          !Number.isFinite(ghs) ||
          ghs < 0 ||
          !Number.isFinite(usd) ||
          usd < 0
        ) {
          typesValid = false;
          break;
        }
        prices[row.type] = { ghs, usd };
        labels[row.type] = label;
      }
      if (!typesValid) {
        toast.error(
          "Accommodation prices must be 0 or more and labels non-empty",
        );
        setSaving(false);
        return;
      }
      ops.push(
        setSetting({
          sessionToken,
          key: "accommodation_prices",
          value: JSON.stringify(prices),
        }),
      );
      ops.push(
        setSetting({
          sessionToken,
          key: "accommodation_labels",
          value: JSON.stringify(labels),
        }),
      );

      // --- Bishop rate ---
      const bishopGhs = Number(draft.bishopGhsText);
      const bishopUsd = Number(draft.bishopUsdText);
      if (
        !Number.isFinite(bishopGhs) ||
        bishopGhs < 0 ||
        !Number.isFinite(bishopUsd) ||
        bishopUsd < 0
      ) {
        toast.error("Bishop rate must be 0 or more in both currencies");
        setSaving(false);
        return;
      }
      ops.push(
        setSetting({
          sessionToken,
          key: "bishop_rate",
          value: JSON.stringify({ ghs: bishopGhs, usd: bishopUsd }),
        }),
      );

      // --- Pool totals (direct edits; failures abort the save) ---
      const poolEdits: Array<{ id: string; total: number }> = [];
      for (const pool of settings.pools) {
        const raw = draft.poolTotals[pool._id];
        const total = Number(raw);
        if (!Number.isInteger(total) || total < 0) {
          toast.error(
            `Pool total for ${pool.accommodationType} (${pool.scope.replace("_", " ")}) must be a whole number of 0 or more`,
          );
          setSaving(false);
          return;
        }
        if (total !== pool.total) {
          poolEdits.push({ id: pool._id, total });
        }
      }
      for (const edit of poolEdits) {
        ops.push(
          setPoolTotal({
            sessionToken,
            poolId: edit.id as Parameters<typeof setPoolTotal>[0]["poolId"],
            total: edit.total,
          }),
        );
      }

      if (ops.length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }
      await Promise.all(ops);
      toast.success("Settings saved");
      if (ops.length === 0) {
        toast.info("No changes to save");
        return;
      }
      await Promise.all(ops);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registration &amp; accommodation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agc-deadline">Registration &amp; accommodation deadline</Label>
              <Input
                id="agc-deadline"
                type="datetime-local"
                value={draft.deadline}
                onChange={(e) => patch({ deadline: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Shown to representatives; blocks new registrations and bookings
                once passed.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agc-hold-hours">Offline payment hold window (hours)</Label>
              <Input
                id="agc-hold-hours"
                type="number"
                min={1}
                max={720}
                value={draft.holdHoursText}
                onChange={(e) => patch({ holdHoursText: e.target.value })}
                className={!holdValid ? "border-destructive" : undefined}
              />
              <p className="text-xs text-muted-foreground">
                How long an offline booking keeps its reserved rooms before the
                hold expires (1–720 hours).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bank payment details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agc-registration-bank">Registration payments</Label>
            <Textarea
              id="agc-registration-bank"
              rows={6}
              className="font-mono text-xs"
              value={draft.registrationBankDetails}
              onChange={(e) => patch({ registrationBankDetails: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Shown on the offline registration payment form. One detail per line.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agc-accommodation-bank">Accommodation payments</Label>
            <Textarea
              id="agc-accommodation-bank"
              rows={6}
              className="font-mono text-xs"
              value={draft.accommodationBankDetails}
              onChange={(e) => patch({ accommodationBankDetails: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Shown on the offline accommodation payment form. One detail per line.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accommodation types &amp; pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Every option is priced per bed (one bed per guest). Price and label
            changes apply to new bookings only — existing bookings keep their
            original price.
          </p>
          <div className="space-y-3">
            {settings.accommodationTypes.map((row) => (
              <div
                key={row.type}
                className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]"
              >
                <div className="space-y-1.5">
                  <Label htmlFor={`acc-label-${row.type}`}>
                    {row.type.replace(/_/g, " ")}
                  </Label>
                  <Input
                    id={`acc-label-${row.type}`}
                    value={draft.typeLabels[row.type] ?? ""}
                    onChange={(e) =>
                      patch({
                        typeLabels: {
                          ...draft.typeLabels,
                          [row.type]: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`acc-ghs-${row.type}`}>GHS / bed</Label>
                  <Input
                    id={`acc-ghs-${row.type}`}
                    type="number"
                    min={0}
                    value={draft.typePrices[row.type]?.ghs ?? ""}
                    onChange={(e) =>
                      patch({
                        typePrices: {
                          ...draft.typePrices,
                          [row.type]: {
                            ghs: e.target.value,
                            usd: draft.typePrices[row.type]?.usd ?? "",
                          },
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`acc-usd-${row.type}`}>USD / bed</Label>
                  <Input
                    id={`acc-usd-${row.type}`}
                    type="number"
                    min={0}
                    value={draft.typePrices[row.type]?.usd ?? ""}
                    onChange={(e) =>
                      patch({
                        typePrices: {
                          ...draft.typePrices,
                          [row.type]: {
                            ghs: draft.typePrices[row.type]?.ghs ?? "",
                            usd: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="bishop-ghs">EBPV Bishop rate (GHS)</Label>
              <Input
                id="bishop-ghs"
                type="number"
                min={0}
                className="w-32"
                value={draft.bishopGhsText}
                onChange={(e) => patch({ bishopGhsText: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bishop-usd">EBPV Bishop rate (USD)</Label>
              <Input
                id="bishop-usd"
                type="number"
                min={0}
                className="w-32"
                value={draft.bishopUsdText}
                onChange={(e) => patch({ bishopUsdText: e.target.value })}
              />
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              Special per-bed rate applied when a guest on EBPV is flagged as
              Bishop.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accommodation pool capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Total beds per pool. Totals cannot go below what is already
            reserved or confirmed; every change is recorded in the inventory
            ledger.
          </p>
          {settings.pools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No inventory pools yet — they are created automatically on first
              use (or when the AGC seed runs).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Pool</th>
                    <th className="py-2 pr-3 font-medium">Reserved</th>
                    <th className="py-2 pr-3 font-medium">Confirmed</th>
                    <th className="py-2 pr-3 font-medium">Available</th>
                    <th className="py-2 pr-3 font-medium">Total beds</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.pools.map((pool) => (
                    <tr key={pool._id} className="border-t">
                      <td className="py-2 pr-3 capitalize">
                        {pool.accommodationType.replace(/_/g, " ")}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {pool.scope.replace(/_/g, " ")}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {pool.reserved}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {pool.confirmed}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {pool.available}
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min={pool.reserved + pool.confirmed}
                          aria-label={`Total for ${pool.accommodationType} (${pool.scope})`}
                          className="w-24"
                          value={draft.poolTotals[pool._id] ?? ""}
                          onChange={(e) =>
                            patch({
                              poolTotals: {
                                ...draft.poolTotals,
                                [pool._id]: e.target.value,
                              },
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Guest titles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Options offered for each guest on the accommodation forms (e.g.
            Bishop, Member). Blank titles are not allowed.
          </p>
          <div className="space-y-2">
            {draft.titles.map((title, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={title}
                  aria-label={`Title ${index + 1}`}
                  onChange={(e) =>
                    patch({
                      titles: draft.titles.map((t, i) =>
                        i === index ? e.target.value : t,
                      ),
                    })
                  }
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove title ${title || index + 1}`}
                  disabled={draft.titles.length <= 1}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    patch({
                      titles: draft.titles.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => patch({ titles: [...draft.titles, ""] })}
          >
            <Plus className="size-4" />
            Add title
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={!canSave} onClick={() => void save()}>
          {saving ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save changes
        </Button>
        {!holdValid && (
          <p className="text-xs text-destructive">
            Hold window must be between 1 and 720 hours.
          </p>
        )}
        {deadlineIso === null && (
          <p className="text-xs text-destructive">Pick a valid deadline.</p>
        )}
      </div>

      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <TriangleAlert className="size-4" />
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="max-w-lg space-y-1">
              <Label className="text-sm">Registration lockdown</Label>
              <p className="text-xs text-muted-foreground">
                Immediately blocks all new registrations and accommodation
                bookings across the portal — independent of the deadline.
                Existing entries are untouched. Takes effect instantly; no
                save needed.
              </p>
              {systemStatus?.locked && (
                <p className="text-xs font-semibold text-destructive">
                  LOCKED — new registrations and bookings are being rejected.
                </p>
              )}
            </div>
            {systemStatus === undefined ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={systemStatus.locked}
                aria-label="Registration lockdown"
                disabled={lockdownBusy}
                onClick={handleLockdownSwitch}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                  systemStatus.locked
                    ? "bg-destructive"
                    : "border border-border bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block size-4 rounded-full bg-white shadow transition-transform",
                    systemStatus.locked ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            )}
          </div>
          <div className="space-y-1 rounded-lg border p-3">
            <Label className="text-sm">Email delivery (SMTP)</Label>
            {systemStatus === undefined ? (
              <Skeleton className="h-5 w-56" />
            ) : systemStatus.smtp.configured ? (
              <p className="text-xs text-muted-foreground">
                Configured —{" "}
                <span className="font-mono">
                  {systemStatus.smtp.host}:{systemStatus.smtp.port}
                  {systemStatus.smtp.secure ? " (TLS)" : ""}
                </span>{" "}
                · from <span className="font-mono">{systemStatus.smtp.from}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not configured — credential and review emails are logged on the
                Emails page but not delivered.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              SMTP is set via environment variables (SMTP_HOST, SMTP_PORT,
              SMTP_USER, SMTP_FROM) and cannot be changed here.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Typed-keyword guard for arming the lockdown — cannot be flipped accidentally. */}
      <Dialog
        open={lockdownConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setLockdownConfirmOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" />
              Enable registration lockdown?
            </DialogTitle>
            <DialogDescription>
              Every new registration and accommodation booking across the
              portal will be rejected immediately until the lockdown is
              switched off. Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {LOCKDOWN_KEYWORD}
              </span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={lockdownConfirmText}
            placeholder={`Type ${LOCKDOWN_KEYWORD} to confirm`}
            aria-label={`Type ${LOCKDOWN_KEYWORD} to confirm`}
            onChange={(e) => setLockdownConfirmText(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLockdownConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={lockdownBusy || lockdownConfirmText.trim() !== LOCKDOWN_KEYWORD}
              onClick={() => {
                setLockdownConfirmOpen(false);
                void toggleLockdown();
              }}
            >
              {lockdownBusy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <TriangleAlert className="size-4" />
              )}
              Lock registrations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
