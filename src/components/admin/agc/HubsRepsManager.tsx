"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  InboxIcon,
  KeyRound,
  Mail,
  PowerOff,
  SearchIcon,
  Sparkles,
  Trash2,
  UserPlus,
  UserX,
  UsersRound,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/portal/StatTile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HUB_FILTERS,
  HUB_SORTS,
  QUIET_TONE_CLASS,
  hubAvatarClass,
  hubInitials,
  hubMatchesSearch,
  hubRosterSummary,
  matchesHubFilter,
  quietLabel,
  quietTone,
  sortHubRows,
} from "@/lib/hubRosterView";
import type { HubFilterId, HubRosterRow, HubSortId } from "@/lib/hubRosterView";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HubRow = HubRosterRow;

/** Toast with a 10s undo window — used for soft-deletes (7-day restore). */
function deleteToast(
  message: string,
  undo: () => Promise<void>,
): void {
  toast.success(message, {
    action: {
      label: "Undo",
      onClick: () => void undo(),
    },
    duration: 10_000,
  });
}

function RepStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "active"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : status === "disabled"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-amber-300 bg-amber-50 text-amber-800"
      }
    >
      {status === "pending_setup" ? "pending setup" : status}
    </Badge>
  );
}

function HubAvatar({ hubName, large = false }: { hubName: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        large ? "size-10 text-sm" : "size-8 text-[11px]",
        hubAvatarClass(hubName),
      )}
    >
      {hubInitials(hubName)}
    </span>
  );
}

function QuietBadge({ hub }: { hub: HubRow }) {
  const hasActivity =
    hub.registrations.lastActivityAt > 0 || hub.bookings.lastActivityAt > 0;
  const tone = quietTone(hub.inactiveDays, hasActivity);
  return (
    <Badge variant="outline" className={QUIET_TONE_CLASS[tone]}>
      {quietLabel(hub.inactiveDays, hasActivity)}
    </Badge>
  );
}

/** Column number with an amber "awaiting" pip underneath when work is pending. */
function StatCell({
  value,
  pending,
  pendingLabel,
}: {
  value: number;
  pending: number;
  pendingLabel: string;
}) {
  return (
    <div className="text-right">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {pending > 0 ? (
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {pending} {pendingLabel}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">—</p>
      )}
    </div>
  );
}

/**
 * Inline rep actions for the detail panel: enable/disable the account,
 * issue fresh credentials, edit the contact email, and delete the account.
 */
function RepActions({
  rep,
  isAdmin,
  onCredentials,
  onEditEmail,
  onDeleted,
}: {
  rep: NonNullable<HubRow["rep"]>;
  isAdmin: boolean;
  onCredentials: (text: string) => void;
  onEditEmail: (rep: NonNullable<HubRow["rep"]>) => void;
  onDeleted: (username: string, undo: () => Promise<void>) => void;
}) {
  const { sessionToken } = useAdminSession();
  const setRepStatus = useMutation(api.agcAdminData.setRepStatus);
  const deleteRepMutation = useMutation(api.agcAdminData.deleteRep);
  const restoreRepMutation = useMutation(api.agcAdminData.restoreRep);
  const issueTempPassword = useAction(api.agcAdmin.issueTempPassword);
  const [busy, setBusy] = useState(false);

  const toggleStatus = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      await setRepStatus({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
        status: rep.status === "disabled" ? "active" : "disabled",
      });
      toast.success(
        rep.status === "disabled"
          ? `Enabled ${rep.username}`
          : `Disabled ${rep.username} — sign-ins are blocked`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update rep"));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      const result = await issueTempPassword({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
        clientOrigin: window.location.origin,
      });
      onCredentials(`${result.username}: ${result.tempPassword}`);
      toast.success(
        result.tempPassword
          ? `New temporary password issued for ${result.username}`
          : `Credentials resent for ${result.username}`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to reset password"));
    } finally {
      setBusy(false);
    }
  };

  const deleteRep = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      const result = await deleteRepMutation({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
      });
      onDeleted(result.username, async () => {
        try {
          await restoreRepMutation({
            sessionToken,
            repId: rep._id as Id<"agcRepresentatives">,
          });
          toast.success(`Restored ${result.username}`);
        } catch (err) {
          toast.error(
            ...toastFriendlyErrorParts(err, "Failed to restore representative"),
          );
        }
      });
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to delete representative"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void toggleStatus()}
      >
        <PowerOff className="size-3.5" />
        {rep.status === "disabled" ? "Enable account" : "Disable account"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void resetPassword()}
      >
        <KeyRound className="size-3.5" />
        Reset password
      </Button>
      {isAdmin && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onEditEmail(rep)}
          >
            <Mail className="size-3.5" />
            Edit email
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void deleteRep()}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </>
      )}
    </div>
  );
}

/** Inline create-rep form shown in the hub detail panel when a hub has no rep. */
function CreateRepForm({
  hub,
  isAdmin,
  onCredentials,
}: {
  hub: HubRow;
  isAdmin: boolean;
  onCredentials: (text: string) => void;
}) {
  const { sessionToken } = useAdminSession();
  const createRepAction = useAction(api.agcAdmin.createRep);
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <UserX className="size-4" />
        No rep account yet — ask an admin to create one.
      </p>
    );
  }

  const create = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      const result = await createRepAction({
        sessionToken,
        hubId: hub._id as Id<"agcHubs">,
        email: email.trim() || undefined,
        tempPassword: tempPassword.trim() || undefined,
        clientOrigin: window.location.origin,
      });
      onCredentials(`${result.username}: ${result.tempPassword}`);
      toast.success(`Representative created for ${hub.hubName}`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to create representative"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <UserX className="size-4" />
        No rep account yet — create one for this hub.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`rep-email-${hub._id}`} className="text-xs">
            Email (optional)
          </Label>
          <Input
            id={`rep-email-${hub._id}`}
            type="email"
            placeholder="rep@example.com"
            className="h-8 w-56"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rep-pass-${hub._id}`} className="text-xs">
            Temp password (optional)
          </Label>
          <Input
            id={`rep-pass-${hub._id}`}
            type="text"
            placeholder="auto-generated"
            className="h-8 w-44"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" disabled={busy} onClick={() => void create()}>
          <UserPlus className="size-3.5" />
          Create rep
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Username is derived from the hub name. Credentials are emailed when an
        address is given — copy them here either way; the password shows once.
      </p>
    </div>
  );
}

function EditEmailDialog({
  rep,
  onClose,
}: {
  rep: NonNullable<HubRow["rep"]> | null;
  onClose: () => void;
}) {
  const { sessionToken } = useAdminSession();
  const setRepEmail = useMutation(api.agcAdminData.setRepEmail);
  const [email, setEmail] = useState(rep?.email ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!sessionToken || !rep || busy) return;
    setBusy(true);
    try {
      await setRepEmail({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
        email,
      });
      toast.success(
        email.trim()
          ? `Email updated for ${rep.username}`
          : `Email cleared for ${rep.username}`,
      );
      onClose();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update email"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={rep !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit email — {rep?.username ?? ""}</DialogTitle>
          <DialogDescription>
            Used for credential emails. Clear the field to remove the address.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="email"
          placeholder={rep?.email ?? "rep@example.com"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bulk-create reps for every hub without one, with a shared temp password. */
function BulkCreateDialog({
  hubs,
  onClose,
  onResult,
}: {
  hubs: HubRow[];
  onClose: () => void;
  onResult: (result: {
    created: Array<{ username: string; tempPassword: string }>;
    skipped: Array<{ hubName: string; reason: string }>;
  }) => void;
}) {
  const { sessionToken } = useAdminSession();
  const bulkCreateRepsAction = useAction(api.agcAdmin.bulkCreateReps);
  const [defaultPassword, setDefaultPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const candidates = hubs.filter((hub) => hub.rep === null && hub.active);
  const run = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      const result = await bulkCreateRepsAction({
        sessionToken,
        tempPassword: defaultPassword.trim() || undefined,
        clientOrigin: window.location.origin,
      });
      onResult(result);
      if (result.created.length > 0) {
        toast.success(
          `Created ${result.created.length} representative account(s)`,
        );
      }
      onClose();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk creation failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create reps in bulk</DialogTitle>
          <DialogDescription>
            {candidates.length === 0
              ? "Every active hub already has a representative."
              : `${candidates.length} active hub(s) without a rep: ${candidates
                  .slice(0, 4)
                  .map((h) => h.hubName)
                  .join(", ")}${candidates.length > 4 ? "…" : ""}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulk-default-password">Shared temp password (optional)</Label>
          <Input
            id="bulk-default-password"
            type="text"
            placeholder="auto-generated"
            value={defaultPassword}
            onChange={(e) => setDefaultPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            One password is shared by all accounts created in this run and must
            be changed on first sign-in. Leave blank to auto-generate.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || candidates.length === 0}
            onClick={() => void run()}
          >
            <Sparkles className="size-4" />
            Create {candidates.length || ""} rep(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  selected,
  onClose,
  onCleared,
}: {
  selected: Map<string, string>;
  onClose: () => void;
  onCleared: () => void;
}) {
  const { sessionToken } = useAdminSession();
  const deleteRepsBulkMutation = useMutation(api.agcAdminData.deleteRepsBulk);
  const restoreRepMutation = useMutation(api.agcAdminData.restoreRep);
  const [busy, setBusy] = useState(false);

  const entries = [...selected.entries()];
  const run = async () => {
    if (!sessionToken || busy || entries.length === 0) return;
    setBusy(true);
    try {
      const ids = entries.map(([id]) => id) as Id<"agcRepresentatives">[];
      const result = await deleteRepsBulkMutation({ sessionToken, repIds: ids });
      if (result.deleted > 0) {
        deleteToast(
          `Deleted ${result.deleted} account(s) — restorable for 7 days`,
          async () => {
            let restored = 0;
            for (const repId of ids) {
              try {
                await restoreRepMutation({ sessionToken, repId });
                restored += 1;
              } catch {
                // Skip ids that were already restored or cannot clash-restore.
              }
            }
            if (restored > 0) toast.success(`Restored ${restored} account(s)`);
          },
        );
      }
      if (result.missing.length > 0) {
        toast.info(`${result.missing.length} selected account(s) no longer exist`);
      }
      onCleared();
      onClose();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk delete failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {entries.length} rep account(s)?</DialogTitle>
          <DialogDescription>
            Accounts are soft-deleted and restorable for 7 days. Hubs are kept.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
          {entries.map(([id, username]) => (
            <li key={id} className="font-mono text-xs">
              {username}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || entries.length === 0}
            onClick={() => void run()}
          >
            <Trash2 className="size-4" />
            Delete {entries.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Expanded detail: mini stat tiles + rep account card. */
function HubDetail({
  hub,
  isAdmin,
  onCredentials,
  onEditEmail,
  onDeleted,
}: {
  hub: HubRow;
  isAdmin: boolean;
  onCredentials: (v: string) => void;
  onEditEmail: (rep: NonNullable<HubRow["rep"]>) => void;
  onDeleted: (username: string, undo: () => Promise<void>) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Registrations
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Delegates" value={hub.registrations.delegates} />
          <StatTile size="sm" tone="positive" label="Confirmed" value={hub.registrations.confirmed} />
          <StatTile size="sm" tone="warning" label="Awaiting review" value={hub.registrations.pending} />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Bookings" value={hub.bookings.total} />
          <StatTile size="sm" tone="positive" label="Confirmed" value={hub.bookings.confirmed} />
          <StatTile size="sm" tone="warning" label="Awaiting review" value={hub.bookings.pending} />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3">
        <HubAvatar hubName={hub.hubName} large />
        {hub.rep ? (
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{hub.rep.username}</span>
              <RepStatusBadge status={hub.rep.status} />
              {!hub.rep.profileComplete && (
                <Badge variant="outline" className="text-[10px]">setup incomplete</Badge>
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="size-3" />
              {hub.rep.email ?? "no email on file"}
            </p>
            <RepActions
              rep={hub.rep}
              isAdmin={isAdmin}
              onCredentials={onCredentials}
              onEditEmail={onEditEmail}
              onDeleted={onDeleted}
            />
          </div>
        ) : (
          <CreateRepForm hub={hub} isAdmin={isAdmin} onCredentials={onCredentials} />
        )}
      </div>
    </div>
  );
}

export function HubsRepsManager() {
  const { sessionToken, user } = useAdminSession();
  // Rep account setup/maintenance is admin-only server-side; staff can browse.
  const isAdmin = user?.role === "admin";

  const roster = useQuery(
    api.agcAdminData.getHubRoster,
    sessionToken ? { sessionToken } : "skip",
  ) as HubRow[] | undefined;
  const exportReps = useAction(api.agcExcel.exportRepsExcel);

  // Credential banner (shown after create/reset issues a temp password).
  const [credentials, setCredentials] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HubFilterId>("all");
  const [sort, setSort] = useState<HubSortId>("name");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [emailTarget, setEmailTarget] = useState<
    NonNullable<HubRow["rep"]> | null
  >(null);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [exportingReps, setExportingReps] = useState(false);

  const summary = useMemo(
    () => hubRosterSummary(roster ?? []),
    [roster],
  );

  const rows = useMemo(() => {
    const list = (roster ?? []).filter(
      (hub) =>
        matchesHubFilter(filter, hub) && hubMatchesSearch(hub, search),
    );
    return sortHubRows(sort, list);
  }, [roster, filter, search, sort]);

  const withoutRep = useMemo(
    () => (roster ?? []).filter((hub) => hub.rep === null && hub.active).length,
    [roster],
  );

  const exportRepsSheet = async () => {
    if (!sessionToken || exportingReps) return;
    setExportingReps(true);
    try {
      const result = await exportReps({ sessionToken });
      const binary = atob(result.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Representatives exported");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Export failed"));
    } finally {
      setExportingReps(false);
    }
  };

  const toggleRepSelected = (
    repId: string,
    username: string,
    checked: boolean,
  ) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(repId, username);
      else next.delete(repId);
      return next;
    });
  };

  const handleDeleted = (username: string, undo: () => Promise<void>) => {
    deleteToast(`Deleted ${username} — restorable for 7 days`, undo);
  };

  if (!sessionToken) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (roster === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles — click one to jump the list to that view. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" className="text-left" onClick={() => setFilter("all")}>
          <StatTile
            label="Total hubs"
            value={summary.hubs}
            hint={summary.pendingSetup + " pending setup"}
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("active")}>
          <StatTile
            label="Active reps"
            value={summary.activeReps}
            tone="positive"
            hint="can sign in and book"
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("no_rep")}>
          <StatTile
            label="Hubs without rep"
            value={withoutRep}
            tone={withoutRep > 0 ? "warning" : "positive"}
            hint="create reps to unlock portals"
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("attention")}>
          <StatTile
            label="Needs attention"
            value={summary.attention}
            tone={summary.attention > 0 ? "warning" : "positive"}
            hint="receipts or holds waiting"
          />
        </button>
      </div>

      {credentials && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-mono text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          New credentials: {credentials} — copy now, shown once.
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Hubs &amp; representatives</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Hub, username or email…"
                  className="h-9 w-56 pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort((v ?? "name") as HubSortId)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUB_SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Sort: {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <DropdownMenu>                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9"
                        />
                      }
                    >
                      <UsersRound className="size-4" />
                      Rep accounts
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setBulkCreateOpen(true)}>
                      <UserPlus className="size-4" />
                      Create reps in bulk…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={exportingReps}
                      onSelect={() => void exportRepsSheet()}
                    >
                      <Download className="size-4" />
                      Export (.xlsx)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={selected.size === 0}
                      onSelect={() => setBulkDeleteOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Delete selected ({selected.size})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {HUB_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "border-gold bg-gold/15 text-ink"
                    : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-gold/15">
                <InboxIcon className="size-5 text-gold-dark" />
              </span>
              <p className="text-sm font-medium">No hubs match</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {search || filter !== "all"
                  ? "Try a different search or filter chip."
                  : "Hubs appear here once seeded or imported."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-2 xl:hidden">
                {rows.map((hub) => (
                  <li key={hub._id}>
                    <div
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        hub.needsAttention && "border-l-4 border-l-amber-400",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {isAdmin && hub.rep && (
                          <Checkbox
                            checked={selected.has(hub.rep._id)}
                            onCheckedChange={(v) =>
                              toggleRepSelected(
                                hub.rep!._id,
                                hub.rep!.username,
                                v === true,
                              )
                            }
                            aria-label={`Select ${hub.rep.username} for bulk delete`}
                            className="mt-0.5"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(expanded === hub._id ? null : hub._id)
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <HubAvatar hubName={hub.hubName} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                              {hub.needsAttention && (
                                <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                              )}
                              {hub.hubName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {hub.rep
                                ? hub.rep.username + " · " + (hub.rep.email ?? "no email")
                                : "no rep account"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{hub.registrations.delegates}</p>
                            <p className="text-[10px] text-muted-foreground">delegates</p>
                          </div>
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {hub.rep && <RepStatusBadge status={hub.rep.status} />}
                        <QuietBadge hub={hub} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {isAdmin && <TableHead className="w-8" />}
                      <TableHead className="w-8" />
                      <TableHead>Hub</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Representative</TableHead>
                      <TableHead className="text-right">Delegates</TableHead>
                      <TableHead className="text-right">Registrations</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((hub) => (
                      <Fragment key={hub._id}>
                        <TableRow
                          className={cn(
                            "cursor-pointer",
                            hub.needsAttention && "border-l-4 border-l-amber-400",
                          )}
                          onClick={() =>
                            setExpanded(expanded === hub._id ? null : hub._id)
                          }
                        >
                          {isAdmin && (
                            <TableCell>
                              {hub.rep && (
                                <Checkbox
                                  checked={selected.has(hub.rep._id)}
                                  onCheckedChange={(v) =>
                                    toggleRepSelected(
                                      hub.rep!._id,
                                      hub.rep!.username,
                                      v === true,
                                    )
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select ${hub.rep.username} for bulk delete`}
                                />
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {expanded === hub._id ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2.5">
                              <HubAvatar hubName={hub.hubName} />
                              <span className="flex items-center gap-1.5 font-medium">
                                {hub.needsAttention && (
                                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                                )}
                                {hub.hubName}
                                {!hub.active && (
                                  <Badge variant="outline" className="text-[10px]">inactive</Badge>
                                )}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-sm capitalize text-muted-foreground">
                            {hub.region.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            {hub.rep ? (
                              <span className="flex flex-col gap-0.5">
                                <RepStatusBadge status={hub.rep.status} />
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="size-3" />
                                  {hub.rep.email ?? "no email"}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <UserX className="size-3.5" />
                                no rep account
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.registrations.delegates}
                              pending={0}
                              pendingLabel=""
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.registrations.confirmed}
                              pending={hub.registrations.pending}
                              pendingLabel="awaiting"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.bookings.confirmed}
                              pending={hub.bookings.pending}
                              pendingLabel="awaiting"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <QuietBadge hub={hub} />
                          </TableCell>
                        </TableRow>
                        {expanded === hub._id && (
                          <TableRow>
                            <TableCell colSpan={isAdmin ? 9 : 8} className="p-2">
                              <HubDetail
                                hub={hub}
                                isAdmin={isAdmin}
                                onCredentials={setCredentials}
                                onEditEmail={setEmailTarget}
                                onDeleted={handleDeleted}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {emailTarget && (
        <EditEmailDialog
          key={emailTarget._id}
          rep={emailTarget}
          onClose={() => setEmailTarget(null)}
        />
      )}
      {bulkCreateOpen && (
        <BulkCreateDialog
          hubs={roster}
          onClose={() => setBulkCreateOpen(false)}
          onResult={(result) => {
            const first = result.created[0];
            if (first) {
              setCredentials(`${first.username}: ${first.tempPassword}`);
            }
          }}
        />
      )}
      {bulkDeleteOpen && (
        <BulkDeleteDialog
          selected={selected}
          onClose={() => setBulkDeleteOpen(false)}
          onCleared={() => setSelected(new Map())}
        />
      )}
    </div>
  );
}
