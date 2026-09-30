"use client";

import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import { AgcAccommodationPage } from "@/components/admin/agc/AgcAccommodationPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminAccommodationPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "accommodation")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to accommodation.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        description="Review room bookings and manage accommodation capacity pools."
        actions={
          <AgcExcelExportButton
            which="bookings"
            label="Export bookings (.xlsx)"
          />
        }
      />
      <AgcAccommodationPage />
    </div>
  );
}
