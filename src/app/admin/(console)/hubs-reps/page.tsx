"use client";

import { HubsRepsManager } from "@/components/admin/agc/HubsRepsManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminHubsRepsPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "registration")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to hubs and representatives.
      </p>
    );
  }

  return <HubsRepsManager />;
}
