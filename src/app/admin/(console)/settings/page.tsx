"use client";

import { AgcSettingsManager } from "@/components/admin/agc/AgcSettingsManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminSettingsPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "settings")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to settings.
      </p>
    );
  }

  return <AgcSettingsManager />;
}
