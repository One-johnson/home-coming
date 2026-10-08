"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import { AgcAccommodationPage } from "@/components/admin/agc/AgcAccommodationPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

function AdminAccommodationInner() {
  const { user } = useAdminSession();
  const searchParams = useSearchParams();
  if (!canAccessArea(user?.role, "accommodation")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to accommodation.
      </p>
    );
  }

  const showPoa = user?.role === "admin" || user?.role === "finance";
  const initialSection =
    searchParams.get("tab") === "poa" && showPoa ? ("poa" as const) : undefined;

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
      <AgcAccommodationPage initialSection={initialSection} />
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
