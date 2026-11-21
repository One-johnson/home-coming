"use client";

import { Suspense } from "react";
import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import { AgcAccommodationPage } from "@/components/admin/agc/AgcAccommodationPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

function AdminAccommodationInner() {
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
        // The bookings export is a finance/accommodation view; the room team
        // only sees the room inventory and the review queue.
        {...(user?.role === "room_assignment"
          ? {}
          : {
              actions: (
                <AgcExcelExportButton
                  which="bookings"
                  label="Export bookings (.xlsx)"
                />
              ),
            })}
      />
      <AgcAccommodationPage />
    </div>
  );
}

export default function AdminAccommodationPage() {
  return (
    <Suspense fallback={null}>
      <AdminAccommodationInner />
    </Suspense>
  );
}
