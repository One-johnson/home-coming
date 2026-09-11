"use client";

import { GroupsManager } from "@/components/admin/GroupsManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminGroupsPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "registration")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to registration groups.
      </p>
    );
  }

  return <GroupsManager />;
}
