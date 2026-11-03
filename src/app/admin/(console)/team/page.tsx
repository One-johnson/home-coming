"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
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
  VENUE_STAFF_ROLES,
  canAccessArea,
  type StaffRole,
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

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "content" as StaffRole,
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
                  setNewUser({ ...newUser, role: value as StaffRole });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...ADMIN_ROLES, ...VENUE_STAFF_ROLES].map((r) => (
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
                options: [...ADMIN_ROLES, ...VENUE_STAFF_ROLES].map((r) => ({
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

        </div>
      </div>
    </div>
  );
}
