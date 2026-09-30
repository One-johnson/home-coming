"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, Copy, KeyRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { teamColumns } from "@/components/admin/columns";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import {
  ADMIN_ROLES,
  ROLE_LABELS,
  canAccessArea,
  type AdminRole,
} from "@/lib/adminRoles";

export default function AdminTeamPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "team");
  const teamMembers = useQuery(
    api.users.listTeamMembers,
    allowed ? sessionArgs : "skip",
  );
  const createUser = useAction(api.authActions.adminCreateUser);
  const setUserRole = useMutation(api.users.setUserRole);
  const setUserActive = useMutation(api.users.setUserActive);

  // Registration codes for the public /admin/register page.
  const listInvites = useQuery(
    api.adminInvites.listInvites,
    allowed && sessionToken ? { sessionToken } : "skip",
  );
  const createInvite = useMutation(api.adminInvites.createInvite);
  const revokeInvite = useMutation(api.adminInvites.revokeInvite);
  const [inviteRole, setInviteRole] = useState<AdminRole>("admin");
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "content" as AdminRole,
  });

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
    try {
      await createUser({
        sessionToken,
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      });
      setNewUser({
        name: "",
        email: "",
        password: "",
        role: "content",
      });
      toast.success("Team member created");
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to create user");
    }
  };

  const handleRoleChange = async (userId: Id<"users">, nextRole: AdminRole) => {
    if (!sessionToken) return;
    try {
      await setUserRole({ sessionToken, userId, role: nextRole });
      toast.success(`Role set to ${ROLE_LABELS[nextRole]}`);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to update role");
    }
  };

  const handleActiveChange = async (userId: Id<"users">, active: boolean) => {
    if (!sessionToken) return;
    try {
      await setUserActive({ sessionToken, userId, active });
      toast.success(active ? "User activated" : "User deactivated");
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to update status");
    }
  };

  const handleCreateInvite = async () => {
    if (!sessionToken || inviteBusy) return;
    setInviteBusy(true);
    try {
      const result = await createInvite({
        sessionToken,
        role: inviteRole,
        email: inviteEmail.trim() || undefined,
      });
      setCreatedCode(result.code);
      setInviteEmail("");
      toast.success("Registration code created");
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to create code");
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRevokeInvite = async (inviteId: Id<"adminInvites">) => {
    if (!sessionToken) return;
    try {
      await revokeInvite({ sessionToken, inviteId });
      toast.success("Code revoked");
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Failed to revoke code");
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create team member</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleCreateUser}>
              <Input
                placeholder="Full name"
                required
                value={newUser.name}
                onChange={(e) =>
                  setNewUser({ ...newUser, name: e.target.value })
                }
              />
              <Input
                type="email"
                placeholder="Email"
                required
                value={newUser.email}
                onChange={(e) =>
                  setNewUser({ ...newUser, email: e.target.value })
                }
              />
              <Input
                type="password"
                placeholder="Temporary password (min 8)"
                required
                minLength={8}
                value={newUser.password}
                onChange={(e) =>
                  setNewUser({ ...newUser, password: e.target.value })
                }
              />
              <Select
                value={newUser.role}
                onValueChange={(value) => {
                  if (!value) return;
                  setNewUser({ ...newUser, role: value as AdminRole });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit">Create user</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registration codes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Let new staff register themselves at /admin/register. Codes are
              single-use and expire after 7 days.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {createdCode && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
                <p className="text-xs font-medium text-emerald-900 dark:text-emerald-300">
                  New code — share it with the invitee:
                </p>
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-xs text-emerald-900 dark:text-emerald-300">
                    {createdCode}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyCode(createdCode)}
                  >
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={inviteRole}
                onValueChange={(value) => {
                  if (value) setInviteRole(value as AdminRole);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="email"
                placeholder="Lock to email (optional)"
                className="min-w-0 flex-1"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Button
                type="button"
                disabled={inviteBusy}
                onClick={() => void handleCreateInvite()}
              >
                <KeyRound className="size-4" />
                Generate
              </Button>
            </div>

            {(listInvites ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No registration codes yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {(listInvites ?? []).map((invite) => (
                  <li
                    key={invite._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{invite.code}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {ROLE_LABELS[invite.role]}
                        {invite.email ? ` · ${invite.email}` : ""} ·{" "}
                        {invite.status === "active"
                          ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                          : invite.status}
                        {invite.usedAt
                          ? ` ${new Date(invite.usedAt).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    {invite.status === "active" && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyCode(invite.code)}
                        >
                          <Copy className="size-3.5" />
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleRevokeInvite(invite._id)}
                        >
                          <Ban className="size-3.5" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>

        <div className="space-y-4">
          <DataTable
            columns={teamColumns}
            data={teamMembers ?? []}
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
            facetFilters={[
              {
                columnId: "role",
                title: "Role",
                options: ADMIN_ROLES.map((r) => ({
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
            ]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Roles & access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(teamMembers ?? []).map((member) => (
                <div
                  key={member._id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                      {!member.active ? " · Inactive" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) => {
                        if (!value) return;
                        void handleRoleChange(member._id, value as AdminRole);
                      }}
                    >
                      <SelectTrigger className="min-w-[11rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ADMIN_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant={member.active ? "outline" : "secondary"}
                      size="sm"
                      onClick={() =>
                        void handleActiveChange(member._id, !member.active)
                      }
                    >
                      {member.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
