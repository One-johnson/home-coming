"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Loader2, LogOut, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { teamTableColumns, type TeamMemberRow } from "@/components/admin/columns";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import {
  ADMIN_ROLES,
  ROLE_LABELS,
  VENUE_STAFF_ROLES,
  canAccessArea,
  type StaffRole,
} from "@/lib/adminRoles";

const ROLE_OPTIONS = [...ADMIN_ROLES, ...VENUE_STAFF_ROLES];
/** "Central" is stored as an empty posting; it means any building. */
const CENTRAL = "central";

type Draft = { role: StaffRole; building: string; active: boolean };

export default function AdminTeamPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "team");
  const teamMembers = useQuery(
    api.users.listTeamMembers,
    allowed ? sessionArgs : "skip",
  );
  // Buildings come from the imported room inventory — a staff member is only
  // ever posted somewhere the rooms screen knows about.
  const rooms = useQuery(
    api.agcRoomAssignments.listRoomsAdmin,
    allowed ? sessionArgs : "skip",
  );
  const createUser = useAction(api.authActions.adminCreateUser);
  const setUserRole = useMutation(api.users.setUserRole);
  const setUserActive = useMutation(api.users.setUserActive);
  const setUserLocation = useMutation(api.users.setUserDefaultLocation);
  const signOutUsers = useMutation(api.users.signOutUsers);
  const deleteUsers = useMutation(api.users.deleteUsers);

  const buildings = useMemo(
    () =>
      [
        ...new Set([
          ...(rooms ?? [])
            .map((room) => room.building)
            .filter(
              (building): building is string =>
                typeof building === "string" && building !== "",
            ),
          // Keep a posting visible even if its building has no rooms yet.
          ...(teamMembers ?? [])
            .map((member) => member.defaultLocation)
            .filter((building): building is string => !!building),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [rooms, teamMembers],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "content" as StaffRole,
  });
  const [creating, setCreating] = useState(false);

  const [managing, setManaging] = useState<TeamMemberRow | null>(null);
  const [draft, setDraft] = useState<Draft>({
    role: "content",
    building: CENTRAL,
    active: true,
  });
  const [saving, setSaving] = useState(false);

  const openManage = useCallback((member: TeamMemberRow) => {
    setManaging(member);
    setDraft({
      role: member.role as StaffRole,
      building: member.defaultLocation ?? CENTRAL,
      active: member.active,
    });
  }, []);
  /** Members waiting on a confirm: sign-out or permanent delete. */
  const [pending, setPending] = useState<{
    kind: "signOut" | "delete";
    members: TeamMemberRow[];
    done?: () => void;
  } | null>(null);
  const [acting, setActing] = useState(false);

  const askSignOut = useCallback((member: TeamMemberRow) => {
    setPending({ kind: "signOut", members: [member] });
  }, []);
  const columns = useMemo(
    () => teamTableColumns(openManage, askSignOut, user?._id ?? null),
    [openManage, askSignOut, user?._id],
  );

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to team management.
      </p>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setCreating(true);
    try {
      await createUser({
        sessionToken,
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      });
      setNewUser({ name: "", email: "", password: "", role: "content" });
      setAddOpen(false);
      toast.success("Team member created");
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  /**
   * One dialog saves role, posting and access together: only the fields that
   * actually changed are written, so a role edit never re-writes the posting.
   */
  const handleSaveMember = async () => {
    if (!managing || !sessionToken) return;
    const userId = managing._id as Id<"users">;
    const currentBuilding = managing.defaultLocation ?? CENTRAL;
    const writes: Promise<unknown>[] = [];
    if (draft.role !== managing.role) {
      writes.push(setUserRole({ sessionToken, userId, role: draft.role }));
    }
    if (draft.building !== currentBuilding) {
      writes.push(
        setUserLocation({
          sessionToken,
          userId,
          defaultLocation: draft.building === CENTRAL ? "" : draft.building,
        }),
      );
    }
    if (draft.active !== managing.active) {
      writes.push(setUserActive({ sessionToken, userId, active: draft.active }));
    }
    if (writes.length === 0) {
      setManaging(null);
      return;
    }
    setSaving(true);
    try {
      await Promise.all(writes);
      toast.success("Team member updated");
      setManaging(null);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to update the member");
    } finally {
      setSaving(false);
    }
  };

  const confirmPending = async () => {
    if (!pending || !sessionToken) return;
    const userIds = pending.members.map((m) => m._id as Id<"users">);
    setActing(true);
    try {
      if (pending.kind === "signOut") {
        const result = await signOutUsers({ sessionToken, userIds });
        toast.success(
          result.signedOut === 0
            ? "Nobody to sign out: those accounts were already signed out"
            : `Signed out ${result.signedOut} member${result.signedOut === 1 ? "" : "s"}`,
        );
      } else {
        const result = await deleteUsers({ sessionToken, userIds });
        toast.success(
          `Deleted ${result.deleted} account${result.deleted === 1 ? "" : "s"}`,
        );
        if (managing && userIds.includes(managing._id as Id<"users">)) {
          setManaging(null);
        }
      }
      pending.done?.();
      setPending(null);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Something went wrong");
    } finally {
      setActing(false);
    }
  };

  const pendingCount = pending?.members.length ?? 0;
  const pendingName =
    pendingCount === 1 ? pending!.members[0].name : `${pendingCount} members`;
  const selfId = user?._id ?? null;

  return (
    <div className="w-full space-y-4">
      <AdminPageHeader
        description="Staff accounts and what each one can reach. Posting someone to a building keeps check-in staff on that building's desk."
        actions={
          <Button type="button" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" />
            Add member
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={(teamMembers ?? []) as TeamMemberRow[]}
        isLoading={teamMembers === undefined}
        emptyMessage="No team members yet."
        searchPlaceholder="Search team..."
        exportFilename="team-members.csv"
        exportRow={(m) => ({
          name: m.name,
          email: m.email,
          role: m.role,
          active: m.active,
          createdAt: new Date(m.createdAt).toISOString(),
        })}
        getRowId={(row) => row._id}
        bulkActions={({ selectedRows, clearSelection }) => {
          const others = selectedRows.filter((m) => m._id !== selfId);
          const signedIn = others.filter((m) => (m.activeSessions ?? 0) > 0);
          return (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={signedIn.length === 0}
                onClick={() =>
                  setPending({
                    kind: "signOut",
                    members: signedIn,
                    done: clearSelection,
                  })
                }
              >
                <LogOut className="size-4" />
                Sign out{signedIn.length > 0 ? ` (${signedIn.length})` : ""}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={others.length === 0}
                onClick={() =>
                  setPending({
                    kind: "delete",
                    members: others,
                    done: clearSelection,
                  })
                }
              >
                <Trash2 className="size-4" />
                Delete{others.length > 0 ? ` (${others.length})` : ""}
              </Button>
            </>
          );
        }}
        facetFilters={[
          {
            columnId: "role",
            title: "Role",
            options: ROLE_OPTIONS.map((r) => ({
              label: ROLE_LABELS[r],
              value: r,
            })),
          },
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ],
          },
          {
            columnId: "session",
            title: "Session",
            options: [
              { label: "Signed in", value: "signed_in" },
              { label: "Signed out", value: "signed_out" },
            ],
          },
        ]}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              The new account signs in with this email and the temporary password
              you set here.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreateUser}>
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Full name</Label>
              <Input
                id="team-name"
                placeholder="Full name"
                required
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Email</Label>
              <Input
                id="team-email"
                type="email"
                placeholder="Email"
                required
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-password">Temporary password</Label>
              <Input
                id="team-password"
                type="password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => {
                  if (!value) return;
                  setNewUser({ ...newUser, role: value as StaffRole });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={managing !== null}
        onOpenChange={(open) => {
          if (!open) setManaging(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{managing?.name ?? "Manage member"}</DialogTitle>
            <DialogDescription>{managing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={draft.role}
                onValueChange={(value) => {
                  if (!value) return;
                  setDraft({ ...draft, role: value as StaffRole });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Venue staff are posted to one building; a check-in account also
                lands there and cannot switch away. */}
            <div className="space-y-1.5">
              <Label>Building</Label>
              <Select
                value={draft.building}
                onValueChange={(value) => {
                  if (!value) return;
                  setDraft({ ...draft, building: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CENTRAL}>Central (any building)</SelectItem>
                  {buildings.map((building) => (
                    <SelectItem key={building} value={building}>
                      {building}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Access</p>
                <p className="text-sm text-muted-foreground">
                  {draft.active
                    ? "This account can sign in."
                    : "Sign-in is blocked until the account is activated."}
                </p>
              </div>
              <Button
                type="button"
                variant={draft.active ? "outline" : "secondary"}
                size="sm"
                onClick={() => setDraft({ ...draft, active: !draft.active })}
              >
                {draft.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
            {managing && managing._id !== selfId ? (
              <div className="space-y-2 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Session</p>
                    <p className="text-sm text-muted-foreground">
                      {(managing.activeSessions ?? 0) > 0
                        ? "Signed in now. Signing out ends every open tab."
                        : "Not signed in anywhere."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={(managing.activeSessions ?? 0) === 0}
                    onClick={() =>
                      setPending({ kind: "signOut", members: [managing] })
                    }
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Delete account
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Removes the account for good. Audit history is kept.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      setPending({ kind: "delete", members: [managing] })
                    }
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setManaging(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveMember()}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={pending?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Delete ${pendingName}?`}
        description={
          pendingCount === 1
            ? "This account is removed for good and signed out everywhere. It cannot be undone; add the person again to restore access."
            : "These accounts are removed for good and signed out everywhere. It cannot be undone."
        }
        confirmLabel={pendingCount === 1 ? "Delete account" : `Delete ${pendingCount}`}
        loading={acting}
        onConfirm={() => void confirmPending()}
      />

      <Dialog
        open={pending?.kind === "signOut"}
        onOpenChange={(open) => {
          if (!open && !acting) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign out {pendingName}?</DialogTitle>
            <DialogDescription>
              Every open tab drops to the sign-in screen right away. They can
              sign in again with their password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={acting}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={acting}
              onClick={() => void confirmPending()}
            >
              {acting ? <Loader2 className="size-4 animate-spin" /> : null}
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
