"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleRoleChange = async (userId: Id<"users">, nextRole: AdminRole) => {
    if (!sessionToken) return;
    try {
      await setUserRole({ sessionToken, userId, role: nextRole });
      toast.success(`Role set to ${ROLE_LABELS[nextRole]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleActiveChange = async (userId: Id<"users">, active: boolean) => {
    if (!sessionToken) return;
    try {
      await setUserActive({ sessionToken, userId, active });
      toast.success(active ? "User activated" : "User deactivated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Team</h2>
        <p className="text-sm text-muted-foreground">
          Create staff accounts and assign roles.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
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
