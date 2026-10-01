"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2Icon, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";

type AgcSettings = {
  deadline: string;
  holdHours: number;
  registrationBankDetails: string;
  accommodationBankDetails: string;
  titles: string[];
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
  return {
    deadline: toLocalInput(settings.deadline),
    holdHoursText: String(settings.holdHours),
    registrationBankDetails: settings.registrationBankDetails,
    accommodationBankDetails: settings.accommodationBankDetails,
    titles: [...settings.titles],
  };
}

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
  const setLockdown = useMutation(api.agcAdminData.setRegistrationLockdown);
  const [lockdownBusy, setLockdownBusy] = useState(false);

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
                onClick={() => void toggleLockdown()}
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
    </div>
  );
}
