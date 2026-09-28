"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";

import { useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ReviewActions, type ReviewDecision } from "@/components/admin/agc/AgcAdminClient";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, CopyCheck, Download, Mail as MailIcon, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bookingStatusMeta, paymentStatusMeta } from "@/lib/agcPortal";

type AdminBookingRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  bookingStatus: string;
  adminMessage: string | null;
  offline: { amountPaid: number; referenceNumber: string; method: string; paymentDate: string; receiptFileName?: string } | null;
  receiptUrl: string | null;
  expiresAt: number | null;
  guests: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    gender: string;
    title: string;
    accommodationType: string;
    isBishopRate: boolean;
    status: string;
  }>;
};

type PoolRow = {
  _id: string;
  accommodationType: string;
  scope: string;
  total: number;
  reserved: number;
  confirmed: number;
  available: number;
};

type DeletedRepRow = {
  _id: string;
  username: string;
  hubName: string;
  email: string | null;
  deletedAt: number;
  deletedBy: string | null;
  purgeAt: number;
  expired: boolean;
};

type RepRow = {
  _id: string;
  username: string;
  hubName: string;
  email: string | null;
  profileComplete: boolean;
  status: string;
  tempPassword: string | null;
};

export function AgcAccommodationTab() {
  const { sessionToken } = useAdminSession();
  const bookings = useQuery(
    api.agcAdminData.listAgcBookingsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const pools = useQuery(
    api.agcAdminData.listPoolsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const reps = useQuery(
    api.agcAdminData.listReps,
    sessionToken ? { sessionToken } : "skip",
  );
  const hubs = useQuery(api.agcAdminData.listHubs, sessionToken ? { sessionToken } : "skip");
  const review = useMutation(api.agcAdminData.reviewAgcBooking);
  const reallocate = useMutation(api.agcAdminData.reallocatePool);
  const createRepAction = useAction(api.agcAdmin.createRep);
  const bulkCreateRepsAction = useAction(api.agcAdmin.bulkCreateReps);
  const resendCredsAction = useAction(api.agcAdmin.issueTempPassword);
  const setRepStatus = useMutation(api.agcAdminData.setRepStatus);
  const setRepEmail = useMutation(api.agcAdminData.setRepEmail);
  const deleteRepMutation = useMutation(api.agcAdminData.deleteRep);
  const deleteRepsBulkMutation = useMutation(api.agcAdminData.deleteRepsBulk);
  const restoreRepMutation = useMutation(api.agcAdminData.restoreRep);
  const deletedReps = useQuery(
    api.agcAdminData.listDeletedReps,
    sessionToken ? { sessionToken } : "skip",
  );
  const importHubsAction = useAction(api.agcAdmin.importHubs);
  const createHubMutation = useMutation(api.agcAdminData.createHub);
  const seedDefaults = useAction(api.agcAdmin.seedAgcDefaults);
  const exportReps = useAction(api.agcExcel.exportRepsExcel);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [poolForm, setPoolForm] = useState({
    accommodationType: "dormitory",
    fromScope: "africa",
    toScope: "rest_of_world",
    quantity: "10",
  });
  const [newRepHub, setNewRepHub] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState("");
  const [bulkResult, setBulkResult] = useState<{
    created: Array<{
      hubId: string;
      hubName: string;
      username: string;
      tempPassword: string;
    }>;
    skipped: Array<{ hubId: string; hubName: string; reason: string }>;
    errors: Array<{ hubName: string; reason: string }>;
  } | null>(null);
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<
    string | null
  >(null);
  const [copiedRepId, setCopiedRepId] = useState<string | null>(null);
  const [exportingReps, setExportingReps] = useState(false);
  const [resendTarget, setResendTarget] = useState<RepRow | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [emailTarget, setEmailTarget] = useState<RepRow | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RepRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [selectedRepIds, setSelectedRepIds] = useState<string[]>([]);
  const [hubForm, setHubForm] = useState({ name: "", region: "ghana", country: "Ghana" });
  const [importText, setImportText] = useState("");

  const decide = async (
    row: AdminBookingRow,
    decision: ReviewDecision,
    message?: string,
  ) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      await review({
        sessionToken,
        bookingId: row._id as Id<"agcBookings">,
        decision,
        message,
      });
      toast.success(`Booking ${decision.replace(/_/g, " ")}d`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleReallocate = async () => {
    if (!sessionToken) return;
    try {
      await reallocate({
        sessionToken,
        accommodationType: poolForm.accommodationType as
          | "dormitory"
          | "hostel"
          | "wise_serpents"
          | "good_general"
          | "ebpv",
        fromScope: poolForm.fromScope as "africa" | "rest_of_world" | "global",
        toScope: poolForm.toScope as "africa" | "rest_of_world" | "global",
        quantity: Number(poolForm.quantity),
      });
      toast.success("Pool reallocation recorded");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Reallocation failed"));
    }
  };

  const pendingHubCount = (hubs ?? []).filter(
    (hub: { _id: string; name: string }) =>
      !(reps ?? []).some((rep: { hubId: string }) => rep.hubId === hub._id),
  ).length;

  const copyRepCredentials = async (rep: RepRow) => {
    const password =
      rep.status === "pending_setup"
        ? (rep.tempPassword ?? "(not available)")
        : "(rep has set their own password)";
    const text = `Username: ${rep.username}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRepId(rep._id);
      toast.success(`Copied credentials for ${rep.username}`);
      setTimeout(() => setCopiedRepId(null), 2000);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  const handleExportReps = async () => {
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

  const runBulkCreate = async () => {
    if (!sessionToken || bulkBusy) return;
    setBulkConfirmOpen(false);
    setBulkBusy(true);
    try {
      const result = await bulkCreateRepsAction({
        sessionToken,
        tempPassword: bulkDefaultPassword.trim() || undefined,
        clientOrigin: window.location.origin,
      });
      setBulkResult(result);
      if (result.created.length > 0) {
        toast.success(
          `Created ${result.created.length} representative account(s)`,
        );
      }
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk creation failed"));
    } finally {
      setBulkBusy(false);
    }
  };

  /** Save a rep's contact email (empty string clears it). */
  const runSaveEmail = async () => {
    if (!sessionToken || !emailTarget || emailBusy) return;
    setEmailBusy(true);
    try {
      await setRepEmail({
        sessionToken,
        repId: emailTarget._id as Id<"agcRepresentatives">,
        email: emailValue,
      });
      toast.success(
        emailValue.trim()
          ? `Email updated for ${emailTarget.username}`
          : `Email cleared for ${emailTarget.username}`,
      );
      setEmailTarget(null);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update email"));
    } finally {
      setEmailBusy(false);
    }
  };

  /** Permanently delete one rep account (keeps the hub). */
  const runDeleteRep = async () => {
    if (!sessionToken || !deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    const target = deleteTarget;
    try {
      await deleteRepMutation({
        sessionToken,
        repId: target._id as Id<"agcRepresentatives">,
      });
      toast.success(`Deleted ${target.username} — restorable for 7 days`, {
        action: {
          label: "Undo",
          onClick: () =>
            void (async () => {
              try {
                await restoreRepMutation({
                  sessionToken,
                  repId: target._id as Id<"agcRepresentatives">,
                });
                toast.success(`Restored ${target.username}`);
              } catch (err) {
                toast.error(
                  ...toastFriendlyErrorParts(err, "Failed to restore representative"),
                );
              }
            })(),
        },
        duration: 10_000,
      });
      setDeleteTarget(null);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to delete representative"));
    } finally {
      setDeleteBusy(false);
    }
  };

  /** Permanently delete every selected rep account. */
  const runBulkDelete = async () => {
    if (!sessionToken || bulkDeleteBusy || selectedRepIds.length === 0) return;
    setBulkDeleteBusy(true);
    try {
      const deletedIds = [...selectedRepIds];
      const result = await deleteRepsBulkMutation({
        sessionToken,
        repIds: deletedIds as Id<"agcRepresentatives">[],
      });
      toast.success(`Deleted ${result.deleted} account(s) — restorable for 7 days`, {
        action: {
          label: "Undo all",
          onClick: () =>
            void (async () => {
              let restored = 0;
              for (const repId of deletedIds) {
                try {
                  await restoreRepMutation({
                    sessionToken,
                    repId: repId as Id<"agcRepresentatives">,
                  });
                  restored += 1;
                } catch {
                  // Skip ids that were already restored or cannot clash-restore.
                }
              }
              if (restored > 0) {
                toast.success(`Restored ${restored} account(s)`);
              }
            })(),
        },
        duration: 10_000,
      });
      if (result.missing.length > 0) {
        toast.info(`${result.missing.length} selected account(s) no longer exist`);
      }
      setSelectedRepIds([]);
      setBulkDeleteOpen(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk delete failed"));
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const toggleRepSelected = (repId: string, checked: boolean) => {
    setSelectedRepIds((prev) =>
      checked ? [...prev, repId] : prev.filter((id) => id !== repId),
    );
  };

  /** Regenerate the temp password for one rep and email the credentials. */
  const runResend = async () => {
    if (!sessionToken || !resendTarget || resendBusy) return;
    setResendBusy(true);
    try {
      const result = await resendCredsAction({
        sessionToken,
        repId: resendTarget._id as Id<"agcRepresentatives">,
        clientOrigin: window.location.origin,
      });
      setLastCreatedCredentials(`${result.username}: ${result.tempPassword}`);
      setResendTarget(null);
      toast.success(
        result.tempPassword
          ? `New temporary password issued for ${result.username}`
          : `Credentials resent for ${result.username}`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to resend credentials"));
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <Tabs defaultValue="bookings" className="w-full space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
        <TabsTrigger value="bookings" className="min-h-10">
          Bookings
        </TabsTrigger>
        <TabsTrigger value="pools" className="min-h-10">
          Pools
        </TabsTrigger>
        <TabsTrigger value="reps" className="min-h-10">
          Representatives
        </TabsTrigger>
        <TabsTrigger value="hubs" className="min-h-10">
          Hubs
        </TabsTrigger>
      </TabsList>

      <TabsContent value="bookings" className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(bookings ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
            No bookings yet.
          </p>
        )}
        {(bookings ?? []).map((row: AdminBookingRow) => {
          const status = bookingStatusMeta(row.bookingStatus);
          const payStatus = paymentStatusMeta(row.paymentStatus);
          return (
            <Card key={row._id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-mono text-sm">
                    {row.referenceNumber || "(pending)"}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                    <Badge variant="outline" className={payStatus.className}>
                      {payStatus.label}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {row.hubName} · {row.currency} {row.totalAmount} ·{" "}
                  {row.paymentMode}
                  {row.expiresAt && row.bookingStatus === "reserved"
                    ? ` · hold expires ${new Date(row.expiresAt).toLocaleString()}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs">
                  {row.guests.map((guest) => (
                    <p key={guest._id}>
                      {guest.title} {guest.firstName} {guest.lastName} ·{" "}
                      {guest.gender} · {guest.accommodationType}
                      {guest.isBishopRate ? " · Bishop rate" : ""}
                      {guest.status !== "active" ? ` · ${guest.status}` : ""}
                    </p>
                  ))}
                </div>
                {row.offline && (
                  <div className="mt-2 rounded-lg bg-muted/50 p-3 text-sm">
                    <p>
                      Amount paid: <strong>{row.currency} {row.offline.amountPaid}</strong>{" "}
                      · {row.offline.method.replace(/_/g, " ")} · {row.offline.paymentDate}{" "}
                      · ref {row.offline.referenceNumber}
                    </p>
                    {row.receiptUrl && (
                      <a
                        href={row.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-primary hover:underline"
                      >
                        View receipt ({row.offline.receiptFileName})
                      </a>
                    )}
                  </div>
                )}
                {row.adminMessage && (
                  <p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
                    Last message: {row.adminMessage}
                  </p>
                )}
                {/* Decided bookings show as confirmed cards — actions only
                    while a payment is awaiting review. */}
                {row.paymentStatus === "pending_verification" && (
                  <ReviewActions
                    disabled={busyId === row._id}
                    onDecision={(decision, message) =>
                      void decide(row, decision, message)
                    }
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="pools" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory pools</CardTitle>
            <CardDescription>
              Reallocation moves capacity between regional pools and is recorded
              in the ledger.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">Type</th>
                    <th className="py-2">Scope</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Reserved</th>
                    <th className="py-2">Confirmed</th>
                    <th className="py-2">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {(pools ?? []).map((pool: PoolRow) => (
                    <tr key={pool._id} className="border-b last:border-0">
                      <td className="py-2">{pool.accommodationType}</td>
                      <td className="py-2">{pool.scope.replace(/_/g, " ")}</td>
                      <td className="py-2">{pool.total}</td>
                      <td className="py-2">{pool.reserved}</td>
                      <td className="py-2">{pool.confirmed}</td>
                      <td className="py-2 font-medium">{pool.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 rounded-lg border border-dashed p-4 sm:grid-cols-5">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={poolForm.accommodationType}
                  onValueChange={(value) =>
                    setPoolForm({
                      ...poolForm,
                      accommodationType:
                        (value as "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv") ??
                        poolForm.accommodationType,
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
                  value={poolForm.fromScope}
                  onValueChange={(value) =>
                    setPoolForm({
                      ...poolForm,
                      fromScope:
                        (value as "africa" | "rest_of_world" | "global") ??
                        poolForm.fromScope,
                    })
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
                  value={poolForm.toScope}
                  onValueChange={(value) =>
                    setPoolForm({
                      ...poolForm,
                      toScope:
                        (value as "africa" | "rest_of_world" | "global") ??
                        poolForm.toScope,
                    })
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
                  value={poolForm.quantity}
                  onChange={(e) =>
                    setPoolForm({ ...poolForm, quantity: e.target.value })
                  }
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
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="hubs" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hub directory</CardTitle>
            <CardDescription>
              Hubs are the denominations/countries whose names double as rep
              usernames. Seed inventory pools and settings once after import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!sessionToken) return;
                try {
                  await seedDefaults({ sessionToken });
                  toast.success("Defaults seeded (settings + inventory pools)");
                } catch (err) {
                  toast.error(...toastFriendlyErrorParts(err, "Seed failed"));
                }
              }}
            >
              Seed defaults
            </Button>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2">Name</th>
                    <th className="py-2">Region</th>
                    <th className="py-2">Country</th>
                    <th className="py-2">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(hubs ?? []).map((hub: { _id: string; name: string; region: string; country: string; active?: boolean }) => (
                    <tr key={hub._id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{hub.name}</td>
                      <td className="py-2">{hub.region.replace(/_/g, " ")}</td>
                      <td className="py-2">{hub.country}</td>
                      <td className="py-2">{hub.active === false ? "no" : "yes"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 rounded-lg border border-dashed p-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Hub name</Label>
                <Input
                  value={hubForm.name}
                  onChange={(e) => setHubForm({ ...hubForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Select
                  value={hubForm.region}
                  onValueChange={(value) =>
                    setHubForm({
                      ...hubForm,
                      region:
                        (value as typeof hubForm.region) ?? hubForm.region,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ghana">Ghana</SelectItem>
                    <SelectItem value="west_africa">West Africa</SelectItem>
                    <SelectItem value="rest_of_africa">Rest of Africa</SelectItem>
                    <SelectItem value="north_america">North America</SelectItem>
                    <SelectItem value="england">England</SelectItem>
                    <SelectItem value="switzerland">Switzerland</SelectItem>
                    <SelectItem value="rest_of_europe">Rest of Europe</SelectItem>
                    <SelectItem value="rest_of_world">Rest of World</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input
                  value={hubForm.country}
                  onChange={(e) => setHubForm({ ...hubForm, country: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={async () => {
                    if (!hubForm.name.trim() || !sessionToken) return;
                    try {
                      await createHubMutation({
                        sessionToken,
                        name: hubForm.name,
                        region: hubForm.region as Parameters<
                          typeof createHubMutation
                        >[0]["region"],
                        country: hubForm.country,
                      });
                      toast.success("Hub created");
                      setHubForm({ name: "", region: hubForm.region, country: hubForm.country });
                    } catch (err) {
                      toast.error(...toastFriendlyErrorParts(err, "Failed"));
                    }
                  }}
                  className="h-10 w-full"
                >
                  Add hub
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-dashed p-4">
              <Label>Bulk import — one hub per line: Name, Region, Country</Label>
              <Textarea
                rows={5}
                className="mt-2 font-mono text-xs"
                placeholder={`Christ Temple, ghana, Ghana\nMadina, ghana, Ghana\nLondon, england, United Kingdom`}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <Button
                type="button"
                className="mt-2"
                onClick={async () => {
                  if (!sessionToken) return;
                  const rows = importText
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [name, region, country] = line.split(",").map((part) => part.trim());
                      return { name, region, country };
                    })
                    .filter(
                      (row) =>
                        row.name &&
                        [
                          "ghana",
                          "west_africa",
                          "rest_of_africa",
                          "north_america",
                          "england",
                          "switzerland",
                          "rest_of_europe",
                          "rest_of_world",
                        ].includes(row.region),
                    );
                  if (rows.length === 0) {
                    toast.error("No valid rows found");
                    return;
                  }
                  try {
                    const result = await importHubsAction({ sessionToken, rows });
                    toast.success(
                      `Imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
                    );
                    setImportText("");
                  } catch (err) {
                    toast.error(...toastFriendlyErrorParts(err, "Import failed"));
                  }
                }}
              >
                Import hubs
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="reps" className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Representative accounts</CardTitle>
                <CardDescription>
                  One account per hub. The username is the hub name in
                  lowercase with underscores. Accounts stay
                  &ldquo;pending setup&rdquo;
                  until the rep signs in with the new password they set during
                  first-time setup.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exportingReps || (reps ?? []).length === 0}
                onClick={() => void handleExportReps()}
              >
                <Download className="size-4" />
                Export Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {(reps ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No representative accounts yet — create them below.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(reps ?? []).map((rep: RepRow) => (
                  <div
                    key={rep._id}
                    className="flex flex-col justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={selectedRepIds.includes(rep._id)}
                            onCheckedChange={(checked) =>
                              toggleRepSelected(
                                rep._id,
                                checked === true,
                              )
                            }
                            aria-label={`Select ${rep.username} for bulk delete`}
                          />
                          <p className="truncate font-medium">{rep.hubName}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Copy username and password for ${rep.username}`}
                          onClick={() => void copyRepCredentials(rep)}
                        >
                          {copiedRepId === rep._id ? (
                            <CopyCheck className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {rep.username}
                      </p>
                      {rep.status === "pending_setup" && rep.tempPassword ? (
                        <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-400">
                          temp: {rep.tempPassword}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEmailTarget(rep);
                          setEmailValue(rep.email ?? "");
                        }}
                        title="Click to set or edit the rep's email"
                      >
                        <MailIcon className="size-3" />
                        {rep.email ?? "no email — click to add"}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          rep.status === "active"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : rep.status === "disabled"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-amber-300 bg-amber-50 text-amber-800"
                        }
                      >
                        {rep.status === "pending_setup"
                          ? "pending setup"
                          : rep.status === "active"
                            ? "active"
                            : "disabled"}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendBusy}
                        onClick={() => setResendTarget(rep)}
                      >
                        Resend credentials
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!sessionToken) return;
                          try {
                            await setRepStatus({
                              sessionToken,
                              repId: rep._id as Id<"agcRepresentatives">,
                              status:
                                rep.status === "disabled" ? "active" : "disabled",
                            });
                            toast.success(
                              rep.status === "disabled" ? "Enabled" : "Disabled",
                            );
                          } catch (err) {
                            toast.error(...toastFriendlyErrorParts(err, "Failed"));
                          }
                        }}
                      >
                        {rep.status === "disabled" ? "Enable" : "Disable"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(rep)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(reps ?? []).length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  {selectedRepIds.length === 0
                    ? "Tick the boxes on rep cards to select several for bulk delete."
                    : `${selectedRepIds.length} selected`}
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={selectedRepIds.length === 0 || bulkDeleteBusy}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete selected
                </Button>
              </div>
            )}
            {deletedReps && deletedReps.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-sm font-medium text-amber-900">
                  Recently deleted ({deletedReps.length})
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Restoring puts the account back into first-time setup; after
                  7 days deleted accounts are removed permanently.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {deletedReps.map((rep: DeletedRepRow) => (
                    <li
                      key={rep._id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs">{rep.username}</span>
                        {" \u00b7 "}
                        {rep.hubName}
                        {" \u00b7 "}
                        <span className="text-xs text-muted-foreground">
                          {rep.expired
                            ? "purge due"
                            : `auto-removes ${new Date(rep.purgeAt).toLocaleDateString()}`}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!sessionToken) return;
                          try {
                            await restoreRepMutation({
                              sessionToken,
                              repId: rep._id as Id<"agcRepresentatives">,
                            });
                            toast.success(`Restored ${rep.username}`);
                          } catch (err) {
                            toast.error(
                              ...toastFriendlyErrorParts(
                                err,
                                "Failed to restore representative",
                              ),
                            );
                          }
                        }}
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-dashed p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Label>Create reps in bulk</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Generates an account for every hub that does not have one
                    yet (currently {pendingHubCount}
                    {" "}
                    hubs). Usernames derive from hub names; each rep must
                    complete first-time setup with the default password.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  type="text"
                  autoComplete="off"
                  className="h-10 max-w-xs"
                  placeholder="Default password for all (min 8 chars, optional)"
                  value={bulkDefaultPassword}
                  onChange={(e) => setBulkDefaultPassword(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => {
                    const pw = bulkDefaultPassword.trim();
                    if (pw && pw.length < 8) {
                      toast.error(
                        "Default password must be at least 8 characters",
                      );
                      return;
                    }
                    if (pendingHubCount === 0) {
                      toast.info("Every active hub already has a rep account");
                      return;
                    }
                    setBulkConfirmOpen(true);
                  }}
                >
                  {bulkBusy
                    ? "Creating…"
                    : `Create reps for all hubs without an account`}
                </Button>
              </div>
              {bulkResult && bulkResult.created.length > 0 && (
                <p className="mt-3 rounded bg-emerald-50 p-3 font-mono text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  Temporary password for all {bulkResult.created.length}{" "}
                  account(s): {bulkResult.created[0].tempPassword}
                </p>
              )}
              {bulkResult && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Created {bulkResult.created.length}
                      {bulkResult.skipped.length > 0
                        ? ` · skipped ${bulkResult.skipped.length}`
                        : ""}
                      {bulkResult.errors.length > 0
                        ? ` · failed ${bulkResult.errors.length}`
                        : ""}
                    </p>
                    {bulkResult.created.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const text = bulkResult.created
                            .map(
                              (r) =>
                                `${r.hubName}\t${r.username}\t${r.tempPassword}`,
                            )
                            .join("\n");
                          try {
                            await navigator.clipboard.writeText(text);
                            toast.success(
                              "Copied all credentials (tab-separated)",
                            );
                          } catch {
                            toast.error("Clipboard unavailable in this browser");
                          }
                        }}
                      >
                        Copy all credentials
                      </Button>
                    ) : null}
                  </div>
                  {bulkResult.created.length > 0 ? (
                    <div className="max-h-64 overflow-auto rounded-md border">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-muted">
                          <tr>
                            <th className="px-3 py-2 font-medium">Hub</th>
                            <th className="px-3 py-2 font-medium">Username</th>
                            <th className="px-3 py-2 font-medium">
                              Default password
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResult.created.map((r) => (
                            <tr key={r.hubId} className="border-t">
                              <td className="px-3 py-1.5">{r.hubName}</td>
                              <td className="px-3 py-1.5 font-mono">
                                {r.username}
                              </td>
                              <td className="px-3 py-1.5 font-mono">
                                {r.tempPassword}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {bulkResult.skipped.length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {bulkResult.skipped.map((s) => (
                        <li key={s.hubId}>
                          Skipped {s.hubName} — {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {bulkResult.errors.length > 0 ? (
                    <ul className="space-y-1 text-xs text-red-600">
                      {bulkResult.errors.map((e) => (
                        <li key={e.hubName}>
                          {e.hubName} — {e.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Passwords are shown once — copy this list now and share each
                    credential with its rep securely.
                  </p>
                </div>
              )}
            </div>
            {lastCreatedCredentials && (
              <p className="rounded bg-emerald-50 p-3 font-mono text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                {lastCreatedCredentials}
              </p>
            )}
            <div className="rounded-lg border border-dashed p-4">
              <Label>
                Create a rep for a hub — uses the default password above (or
                auto-generates one), shown once after creation
              </Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={newRepHub}
                  onValueChange={(value) => setNewRepHub(value ?? "")}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Select a hub…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(hubs ?? [])
                      .filter(
                        (hub: { _id: string; name: string }) =>
                          !(reps ?? []).some(
                            (rep: { hubId: string }) => rep.hubId === hub._id,
                          ),
                      )
                      .map((hub: { _id: string; name: string }) => (
                        <SelectItem key={hub._id} value={hub._id}>
                          {hub.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  disabled={!newRepHub.trim()}                    onClick={async () => {
                      if (!newRepHub.trim() || !sessionToken) return;
                      try {
                        const result = await createRepAction({
                          sessionToken,
                          hubId: newRepHub.trim() as Id<"agcHubs">,
                          tempPassword: bulkDefaultPassword.trim() || undefined,
                          clientOrigin: window.location.origin,
                        });
                        setLastCreatedCredentials(
                          `${result.username}: ${result.tempPassword}`,
                        );
                        toast.success("Representative created");
                        setNewRepHub("");
                      } catch (err) {
                        toast.error(...toastFriendlyErrorParts(err, "Failed"));
                      }
                    }}
                >
                  Create rep
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          open={emailTarget !== null}
          onOpenChange={(open) => {
            if (!open) setEmailTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Email for {emailTarget?.hubName}
              </DialogTitle>
              <DialogDescription>
                Credentials emails (account creation, resends) are sent to this
                address. Clear the field to remove it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="rep-email-input">Email address</Label>
              <Input
                id="rep-email-input"
                type="email"
                placeholder="rep@example.com"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={emailBusy}
                onClick={() => setEmailTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={emailBusy}
                onClick={() => void runSaveEmail()}
              >
                {emailBusy ? "Saving…" : "Save email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Delete representative {deleteTarget?.username}?
              </DialogTitle>
              <DialogDescription>
                The account is disabled immediately and removed from the reps
                list. It stays restorable for 7 days (an Undo button appears
                right after), and is then purged permanently. The hub itself
                is kept.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void runDeleteRep()}
              >
                <Trash2 className="size-4" />
                {deleteBusy ? "Deleting…" : "Delete account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bulkDeleteOpen}
          onOpenChange={(open) => {
            if (!open) setBulkDeleteOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Delete {selectedRepIds.length} representative account(s)?
              </DialogTitle>
              <DialogDescription>
                The selected accounts are disabled immediately and stay
                restorable for 7 days (an Undo button appears right after).
                Their hubs are kept. After 7 days they are purged permanently.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={bulkDeleteBusy}
                onClick={() => setBulkDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={bulkDeleteBusy}
                onClick={() => void runBulkDelete()}
              >
                <Trash2 className="size-4" />
                {bulkDeleteBusy ? "Deleting…" : "Delete selected"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={resendTarget !== null}
          onOpenChange={(open) => {
            if (!open) setResendTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Resend credentials for {resendTarget?.hubName}?
              </DialogTitle>
              <DialogDescription>
                A new temporary password is generated — the rep&rsquo;s current
                password and any active sessions stop working immediately. The
                new credentials are emailed to{" "}
                <strong>{resendTarget?.email ?? "(no email on file)"}</strong>
                {resendTarget?.email
                  ? ", and shown once here after issuing."
                  : ". Add an email for the rep first, or copy the password here to share it manually."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={resendBusy}
                onClick={() => setResendTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={resendBusy}
                onClick={() => void runResend()}
              >
                {resendBusy ? "Issuing…" : "Issue new credentials"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={bulkConfirmOpen}
          onOpenChange={setBulkConfirmOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create {pendingHubCount} representative account(s)?</DialogTitle>
              <DialogDescription>
                Every active hub without an account gets one, using the default
                password you entered. Passwords are shown once after creation —
                copy and distribute them securely.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void runBulkCreate()}>
                Create reps
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>
    </Tabs>
  );
}

