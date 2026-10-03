"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  Loader2Icon,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  computeBookingSummary,
  parsePriceInput,
  typesConfigFromOverview,
} from "@/lib/bookingMath";
import type {
  AccommodationTypeConfig,
  AgcAccommodationType,
  BookingSummary,
  GuestDraft,
} from "@/lib/bookingMath";
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

/** In-page section anchors. Operations is instant — never part of a save. */
type SectionId = "general" | "payments" | "accommodation" | "titles" | "operations";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "general", label: "General" },
  { id: "payments", label: "Payments" },
  { id: "accommodation", label: "Accommodation" },
  { id: "titles", label: "Guest titles" },
  { id: "operations", label: "Operations" },
];

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

/** Counts the text fields that differ from the saved snapshot. */
function countChanged(pairs: Array<[string, string]>): number {
  return pairs.reduce((count, [a, b]) => count + (a === b ? 0 : 1), 0);
}

/** Small amber dot marking sections with unsaved edits. */
function DirtyDot({ className }: { className?: string }) {
  return (
    <span
      title="Unsaved changes"
      aria-label="Unsaved changes"
      className={cn("inline-block size-2 shrink-0 rounded-full bg-amber-500", className)}
    />
  );
}

/**
 * Representative booking used by the live pricing preview: one bed in every
 * type plus an EBPV guest on the Bishop rate, so a bishop-rate edit shows up
 * in the sample total too.
 */
const SAMPLE_BOOKING: Array<
  Pick<GuestDraft, "accommodationType" | "isBishopRate">
> = [
  { accommodationType: "dormitory", isBishopRate: false },
  { accommodationType: "hostel", isBishopRate: false },
  { accommodationType: "wise_serpents", isBishopRate: false },
  { accommodationType: "good_general", isBishopRate: false },
  { accommodationType: "ebpv", isBishopRate: false },
  { accommodationType: "ebpv", isBishopRate: true },
];

/** One currency column of the live sample-booking preview. */
function SampleBookingColumn({
  summary,
  savedTotal,
  labels,
}: {
  summary: BookingSummary;
  savedTotal: number;
  labels: Record<AgcAccommodationType, AccommodationTypeConfig>;
}) {
  const delta = summary.totalAmount - savedTotal;
  return (
    <div className="rounded-md border bg-background p-2.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">
        {summary.currency}
      </p>
      <ul className="mt-1.5 space-y-1">
        {summary.lines.map((line) => (
          <li
            key={`${line.accommodationType}-${line.isBishopRate}`}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate">
              {labels[line.accommodationType].label}
              {line.isBishopRate ? " · Bishop" : ""} × {line.units}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {line.unitPrice} × {line.units} ={" "}
              <span className="font-medium text-foreground">
                {line.subtotal}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-sm">
        <span className="font-medium">Sample total</span>
        <span className="font-semibold tabular-nums">
          {summary.currency} {summary.totalAmount}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Saved total: {summary.currency} {savedTotal}
        {delta !== 0 && (
          <span className={delta > 0 ? " text-amber-700" : " text-emerald-700"}>
            {" "}
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>
        )}
      </p>
    </div>
  );
}

/** Live sample-booking preview for the current (possibly unsaved) prices. */
function SampleBookingPreview({
  previewGhs,
  previewUsd,
  savedGhsTotal,
  savedUsdTotal,
  labels,
  hasEdits,
  fallbackCount,
}: {
  previewGhs: BookingSummary;
  previewUsd: BookingSummary;
  savedGhsTotal: number;
  savedUsdTotal: number;
  labels: Record<AgcAccommodationType, AccommodationTypeConfig>;
  hasEdits: boolean;
  fallbackCount: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Sample booking preview</p>
          <p className="text-xs text-muted-foreground">
            6 guests — one bed in every type, plus one EBPV guest on the Bishop
            rate. Uses your current edits; the server applies them to new
            bookings once saved.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            hasEdits
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "text-muted-foreground"
          }
        >
          {hasEdits ? "Previewing unsaved edits" : "Matches saved"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-3">
        <SampleBookingColumn
          summary={previewGhs}
          savedTotal={savedGhsTotal}
          labels={labels}
        />
        <SampleBookingColumn
          summary={previewUsd}
          savedTotal={savedUsdTotal}
          labels={labels}
        />
      </div>
      {fallbackCount > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {fallbackCount} field
          {fallbackCount === 1 ? " is" : "s are"} empty or not a valid price —
          the preview uses the last saved value there.
        </p>
      )}
    </div>
  );
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

  if (settings === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <AgcSettingsForm
      settings={settings}
      systemStatus={systemStatus}
      sessionToken={sessionToken}
    />
  );
}

function AgcSettingsForm({
  settings,
  systemStatus,
  sessionToken,
}: {
  settings: AgcSettings;
  systemStatus: AgcSystemStatus | undefined;
  sessionToken: string | null;
}) {
  const setSetting = useMutation(api.agcAdminData.setAgcSetting);
  const setPoolTotal = useMutation(api.agcAdminData.setPoolTotal);
  const setLockdown = useMutation(api.agcAdminData.setRegistrationLockdown);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  // Local edits keyed to the server snapshot they started from. With no
  // edits yet (or fresh data after a save) the draft derives directly from
  // `settings` — no state-sync effect needed.
  const [edit, setEdit] = useState<{
    source: AgcSettings;
    value: SettingsDraft;
  } | null>(null);

  const savedDraft = toDraft(settings);
  const draft: SettingsDraft =
    edit && edit.source === settings ? edit.value : savedDraft;

  const patch = (partial: Partial<SettingsDraft>) => {
    const base = edit && edit.source === settings ? edit.value : savedDraft;
    setEdit({ source: settings, value: { ...base, ...partial } });
  };

  // --- Unsaved-change tracking (drives the action bar + section dots) ---
  const dirtySections: Record<SectionId, boolean> = {
    general:
      draft.deadline !== savedDraft.deadline ||
      draft.holdHoursText !== savedDraft.holdHoursText,
    payments:
      draft.registrationBankDetails !== savedDraft.registrationBankDetails ||
      draft.accommodationBankDetails !== savedDraft.accommodationBankDetails,
    accommodation:
      draft.bishopGhsText !== savedDraft.bishopGhsText ||
      draft.bishopUsdText !== savedDraft.bishopUsdText ||
      settings.accommodationTypes.some(
        (row) =>
          (draft.typePrices[row.type]?.ghs ?? "") !==
            (savedDraft.typePrices[row.type]?.ghs ?? "") ||
          (draft.typePrices[row.type]?.usd ?? "") !==
            (savedDraft.typePrices[row.type]?.usd ?? "") ||
          (draft.typeLabels[row.type] ?? "") !==
            (savedDraft.typeLabels[row.type] ?? ""),
      ) ||
      settings.pools.some(
        (pool) =>
          (draft.poolTotals[pool._id] ?? "") !==
          (savedDraft.poolTotals[pool._id] ?? ""),
      ),
    titles: draft.titles.join("\u0000") !== savedDraft.titles.join("\u0000"),
    operations: false,
  };
  const isDirty = SECTIONS.some((section) => dirtySections[section.id]);
  const changeCount = countChanged([
    [draft.deadline, savedDraft.deadline],
    [draft.holdHoursText, savedDraft.holdHoursText],
    [draft.registrationBankDetails, savedDraft.registrationBankDetails],
    [draft.accommodationBankDetails, savedDraft.accommodationBankDetails],
    [draft.bishopGhsText, savedDraft.bishopGhsText],
    [draft.bishopUsdText, savedDraft.bishopUsdText],
    ...settings.accommodationTypes.flatMap((row): Array<[string, string]> => [
      [
        draft.typePrices[row.type]?.ghs ?? "",
        savedDraft.typePrices[row.type]?.ghs ?? "",
      ],
      [
        draft.typePrices[row.type]?.usd ?? "",
        savedDraft.typePrices[row.type]?.usd ?? "",
      ],
      [draft.typeLabels[row.type] ?? "", savedDraft.typeLabels[row.type] ?? ""],
    ]),
    ...settings.pools.map(
      (pool): [string, string] => [
        draft.poolTotals[pool._id] ?? "",
        savedDraft.poolTotals[pool._id] ?? "",
      ],
    ),
    [draft.titles.join("\u0000"), savedDraft.titles.join("\u0000")],
  ]);

  // --- Live sample-booking preview (unsaved edits) ---
  // Recomputed from the draft's text values on every keystroke so admins see
  // the effect of price edits before saving. Fields that are empty or invalid
  // mid-edit fall back to the last saved value rather than showing a
  // misleading total (the fallback count is surfaced in the UI).
  const previewRows = settings.accommodationTypes.map((row) => ({
    row,
    ghs: parsePriceInput(draft.typePrices[row.type]?.ghs),
    usd: parsePriceInput(draft.typePrices[row.type]?.usd),
  }));
  const previewTypes = typesConfigFromOverview(
    previewRows.map(({ row, ghs, usd }) => ({
      type: row.type,
      label: (draft.typeLabels[row.type] ?? "").trim() || row.label,
      unit: "bed" as const,
      maxOccupancy: 1,
      pricing: { ghs: ghs ?? row.pricing.ghs, usd: usd ?? row.pricing.usd },
    })),
  );
  const previewBishopGhs = parsePriceInput(draft.bishopGhsText);
  const previewBishopUsd = parsePriceInput(draft.bishopUsdText);
  const previewFallbackCount =
    previewRows.reduce(
      (count, entry) =>
        count +
        (entry.ghs === null ? 1 : 0) +
        (entry.usd === null ? 1 : 0),
      0,
    ) +
    (previewBishopGhs === null ? 1 : 0) +
    (previewBishopUsd === null ? 1 : 0);
  const previewBishop = {
    ghs: previewBishopGhs ?? settings.bishopRate.ghs,
    usd: previewBishopUsd ?? settings.bishopRate.usd,
  };
  // Sample totals in both currencies: GHS hubs pay in GHS, everyone else USD.
  const previewGhs = computeBookingSummary(
    SAMPLE_BOOKING,
    "ghana",
    previewTypes,
    previewBishop,
  );
  const previewUsd = computeBookingSummary(
    SAMPLE_BOOKING,
    "england",
    previewTypes,
    previewBishop,
  );
  const savedTypes = typesConfigFromOverview(settings.accommodationTypes);
  const savedGhs = computeBookingSummary(
    SAMPLE_BOOKING,
    "ghana",
    savedTypes,
    settings.bishopRate,
  );
  const savedUsd = computeBookingSummary(
    SAMPLE_BOOKING,
    "england",
    savedTypes,
    settings.bishopRate,
  );
  const previewHasEdits =
    previewGhs.totalAmount !== savedGhs.totalAmount ||
    previewUsd.totalAmount !== savedUsd.totalAmount;

  const holdHours = Number(draft.holdHoursText);
  const deadlineIso = fromLocalInput(draft.deadline);
  const titlesValid = draft.titles.every((t) => t.trim().length > 0);
  const holdValid =
    draft.holdHoursText.trim() !== "" &&
    Number.isFinite(holdHours) &&
    holdHours > 0 &&
    holdHours <= 24 * 30;
  const canSave =
    Boolean(sessionToken) && !saving && deadlineIso !== null && holdValid && titlesValid;
  const saveBlocker = !sessionToken
    ? "Sign in to save."
    : deadlineIso === null
      ? "Pick a valid deadline."
      : !holdValid
        ? "Hold window must be between 1 and 720 hours."
        : !titlesValid
          ? "Guest titles cannot be blank."
          : null;

  const save = async () => {
    if (!sessionToken || !canSave || saving || deadlineIso === null) return;
    setSaving(true);
    try {
      const current = savedDraft;
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
      for (const poolEdit of poolEdits) {
        ops.push(
          setPoolTotal({
            sessionToken,
            poolId: poolEdit.id as Parameters<typeof setPoolTotal>[0]["poolId"],
            total: poolEdit.total,
          }),
        );
      }

      if (ops.length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }
      await Promise.all(ops);
      setSavedAt(Date.now());
      toast.success("Settings saved");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  // ⌘/Ctrl+S saves while there are unsaved changes. Re-registered each render
  // so the handler always closes over the latest draft.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isDirty && canSave) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Scroll-spy for the section nav (the console header is h-16, so sections
  // count as active once their top passes ~140px).
  useEffect(() => {
    const onScroll = () => {
      let current: SectionId = "general";
      for (const section of SECTIONS) {
        const el = document.getElementById(`agc-section-${section.id}`);
        if (el && el.getBoundingClientRect().top <= 140) current = section.id;
      }
      setActiveSection(current);
    };
    const frame = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const scrollToSection = (id: SectionId) => {
    const el = document.getElementById(`agc-section-${id}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: "smooth" });
    setActiveSection(id);
  };

  const discard = () => {
    setEdit(null);
    toast.info("Unsaved changes discarded");
  };

  // --- Registration lockdown (instant; independent of the save workflow) ---
  const [lockdownBusy, setLockdownBusy] = useState(false);
  // Typed-keyword guard: the destructive direction of the toggle opens a
  // confirmation dialog that only arms once the keyword is typed exactly.
  const [lockdownConfirmOpen, setLockdownConfirmOpen] = useState(false);
  const [lockdownConfirmText, setLockdownConfirmText] = useState("");

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

  return (
    <div className={cn("space-y-5", isDirty && "pb-28")}>
      {/* Page header: context, live status, and links to the operational tabs. */}
      <AdminPageHeader
        description="Deadline, bank details, per-bed pricing and capacity, guest titles, and operational controls. Edits apply to new bookings only, and only once saved."
        actions={
          <>
            {systemStatus?.locked && (
              <Badge variant="destructive">
                <TriangleAlert />
                Lockdown active
              </Badge>
            )}
            <span className="self-center text-xs text-muted-foreground">
              {savedAt
                ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
                : "No changes saved this session."}
            </span>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/accommodation" />}
            >
              Accommodation console
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/registrations" />}
            >
              Registrations
            </Button>
          </>
        }
      />

      {/* Section navigation with scroll-spy and unsaved-edit dots. */}
      <nav
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1"
      >
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={activeSection === section.id ? "true" : undefined}
            onClick={() => scrollToSection(section.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              activeSection === section.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {section.label}
            {dirtySections[section.id] && <DirtyDot />}
          </button>
        ))}
      </nav>

      <Card id="agc-section-general" data-agc-section="general" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Registration &amp; accommodation
            {dirtySections.general && <DirtyDot />}
          </CardTitle>
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
                inputMode="numeric"
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

      <Card id="agc-section-payments" data-agc-section="payments" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Bank payment details
            {dirtySections.payments && <DirtyDot />}
          </CardTitle>
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

      {/* Pricing + capacity merged: one row per accommodation type. */}
      <Card id="agc-section-accommodation" data-agc-section="accommodation" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Accommodation types
            {dirtySections.accommodation && <DirtyDot />}
          </CardTitle>
          <CardDescription>
            Every option is priced per bed (one bed per guest) and draws from
            inventory pools. Price, label, and capacity changes apply to new
            bookings only — existing bookings keep their original terms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
            <div className="space-y-3">
              <div className="hidden gap-3 px-4 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_7rem_7rem_minmax(0,15rem)]">
                <span>Type &amp; display label</span>
                <span>GHS / bed</span>
                <span>USD / bed</span>
                <span>Capacity (beds)</span>
              </div>
              {settings.accommodationTypes.map((row) => {
                const pools = settings.pools.filter(
                  (pool) => pool.accommodationType === row.type,
                );
                return (
                  <div
                    key={row.type}
                    className="space-y-3 rounded-lg border p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_7rem_7rem_minmax(0,15rem)] lg:items-start lg:gap-3 lg:space-y-0"
                  >
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`acc-label-${row.type}`}
                        className="text-xs capitalize text-muted-foreground"
                      >
                        {row.type.replace(/_/g, " ")} label
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
                    <div className="grid grid-cols-2 gap-3 lg:contents">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`acc-ghs-${row.type}`}
                          className="text-xs text-muted-foreground"
                        >
                          GHS / bed
                        </Label>
                        <Input
                          id={`acc-ghs-${row.type}`}
                          type="number"
                          min={0}
                          inputMode="decimal"
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
                        <Label
                          htmlFor={`acc-usd-${row.type}`}
                          className="text-xs text-muted-foreground"
                        >
                          USD / bed
                        </Label>
                        <Input
                          id={`acc-usd-${row.type}`}
                          type="number"
                          min={0}
                          inputMode="decimal"
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
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Capacity (beds)
                      </p>
                      {pools.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No inventory pool yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {pools.map((pool) => {
                            const held = pool.reserved + pool.confirmed;
                            const draftTotal =
                              parsePriceInput(draft.poolTotals[pool._id]) ??
                              pool.total;
                            const belowHeld = draftTotal < held;
                            return (
                              <div key={pool._id} className="flex items-center gap-2">
                                <span className="w-20 shrink-0 text-[11px] capitalize text-muted-foreground">
                                  {pool.scope.replace(/_/g, " ")}
                                </span>
                                <Input
                                  type="number"
                                  min={held}
                                  inputMode="numeric"
                                  aria-label={`Total beds for ${row.type} (${pool.scope})`}
                                  className="h-8 w-20"
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
                                <span
                                  title={`${pool.reserved} reserved · ${pool.confirmed} confirmed`}
                                  className={cn(
                                    "text-[11px] tabular-nums text-muted-foreground",
                                    belowHeld && "font-medium text-destructive",
                                  )}
                                >
                                  {belowHeld
                                    ? `below the ${held} held`
                                    : `${Math.max(0, draftTotal - held)} free · ${held} held`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Rate rules that don't belong to a single type. */}
              <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="bishop-ghs"
                    className="text-xs text-muted-foreground"
                  >
                    EBPV Bishop rate (GHS / bed)
                  </Label>
                  <Input
                    id="bishop-ghs"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="w-32"
                    value={draft.bishopGhsText}
                    onChange={(e) => patch({ bishopGhsText: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="bishop-usd"
                    className="text-xs text-muted-foreground"
                  >
                    EBPV Bishop rate (USD / bed)
                  </Label>
                  <Input
                    id="bishop-usd"
                    type="number"
                    min={0}
                    inputMode="decimal"
                    className="w-32"
                    value={draft.bishopUsdText}
                    onChange={(e) => patch({ bishopUsdText: e.target.value })}
                  />
                </div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Special per-bed rate applied when a guest on EBPV is flagged
                  as Bishop.
                </p>
              </div>
            </div>

            <SampleBookingPreview
              previewGhs={previewGhs}
              previewUsd={previewUsd}
              savedGhsTotal={savedGhs.totalAmount}
              savedUsdTotal={savedUsd.totalAmount}
              labels={previewTypes}
              hasEdits={previewHasEdits}
              fallbackCount={previewFallbackCount}
            />
          </div>
        </CardContent>
      </Card>

      <Card id="agc-section-titles" data-agc-section="titles" className="scroll-mt-24">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Guest titles
            {dirtySections.titles && <DirtyDot />}
          </CardTitle>
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

      {/* Instant controls — deliberately separate from the saved settings. */}
      <Card
        id="agc-section-operations"
        data-agc-section="operations"
        className="scroll-mt-24 border-destructive/40"
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-4" />
              Operational controls
            </span>
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-muted-foreground"
            >
              Applies instantly — no save needed
            </Badge>
          </CardTitle>
          <CardDescription>
            Live switches that bypass the save workflow above.
          </CardDescription>
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
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-sm">Email delivery (SMTP)</Label>
              {systemStatus === undefined ? (
                <Skeleton className="h-5 w-20 rounded-full" />
              ) : systemStatus.smtp.configured ? (
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  Configured
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  Not configured
                </Badge>
              )}
            </div>
            {systemStatus === undefined ? null : systemStatus.smtp.configured ? (
              <p className="text-xs text-muted-foreground">
                Sending via{" "}
                <span className="font-mono">
                  {systemStatus.smtp.host}:{systemStatus.smtp.port}
                  {systemStatus.smtp.secure ? " (TLS)" : ""}
                </span>{" "}
                · from <span className="font-mono">{systemStatus.smtp.from}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Credential and review emails are logged on the Emails page but
                not delivered.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              SMTP is set via environment variables (SMTP_HOST, SMTP_PORT,
              SMTP_USER, SMTP_FROM) and cannot be changed here.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Floating unsaved-changes bar: only present when there is work to
          commit, anchored bottom-right so it never covers the sidebar. */}
      {isDirty && (
        <div className="fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-elevate backdrop-blur sm:left-auto sm:right-6 sm:max-w-xl">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {changeCount} unsaved change{changeCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              {saveBlocker ?? "Ctrl/⌘ + S to save"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={discard}>
              Discard
            </Button>
            <Button type="button" onClick={() => void save()} disabled={!canSave}>
              {saving ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      )}

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
