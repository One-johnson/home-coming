"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnFiltersState } from "@tanstack/react-table";
import RegistrationsTab, {
  AgcExcelExportButton,
} from "@/components/admin/agc/AgcAdminClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { isAgeingBucketKey } from "@/lib/agcPortal";
import { canAccessArea } from "@/lib/adminRoles";

const PAYMENT_STATUSES = [
  "awaiting_payment",
  "pending_verification",
  "correction_requested",
  "rejected",
  "confirmed",
] as const;

/**
 * Drill-down target for the finance overview stat cards — URLs like
 * /admin/registrations?status=pending_verification&age=7plus land here and
 * seed the table's facet filters so the review queue opens pre-filtered.
 */
function AdminRegistrationsInner() {
  const { user } = useAdminSession();
  const searchParams = useSearchParams();

  const initialFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    const status = searchParams.get("status");
    if (status && (PAYMENT_STATUSES as readonly string[]).includes(status)) {
      filters.push({ id: "paymentStatus", value: [status] });
    }
    const age = searchParams.get("age");
    if (age && isAgeingBucketKey(age)) {
      filters.push({ id: "ageing", value: [age] });
    }
    return filters;
  }, [searchParams]);

  if (!canAccessArea(user?.role, "registration")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to registrations.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        description="Review hub registration submissions and offline payments."
        actions={
          <AgcExcelExportButton
            which="registrations"
            label="Export registrations (.xlsx)"
          />
        }
      />
      <RegistrationsTab initialFilters={initialFilters} />
    </div>
  );
}

export default function AdminRegistrationsPage() {
  return (
    <Suspense fallback={null}>
      <AdminRegistrationsInner />
    </Suspense>
  );
}
