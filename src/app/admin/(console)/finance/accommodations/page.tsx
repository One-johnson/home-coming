"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnFiltersState } from "@tanstack/react-table";
import FinanceAccommodationsTable from "@/components/admin/agc/FinanceAccommodationsTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { isAgeingBucketKey } from "@/lib/agcPortal";

const PAYMENT_STATUSES = [
  "awaiting_payment",
  "pending_verification",
  "correction_requested",
  "rejected",
  "confirmed",
] as const;

/**
 * Finance-only accommodations view: the bookings money table without any
 * review actions. Approvals and deletions live in the accommodation console,
 * so this page is deliberately read-only.
 *
 * Also the drill-down target for the finance overview accommodation tiles —
 * URLs like /admin/finance/accommodations?age=7plus land here and seed the
 * table's facet filters so the review queue opens pre-filtered.
 */
function FinanceAccommodationsInner() {
  const { user } = useAdminSession();
  const searchParams = useSearchParams();

  const initialFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    const paymentStatus = searchParams.get("paymentStatus");
    if (
      paymentStatus &&
      (PAYMENT_STATUSES as readonly string[]).includes(paymentStatus)
    ) {
      filters.push({ id: "paymentStatus", value: [paymentStatus] });
    }
    const age = searchParams.get("age");
    if (age && isAgeingBucketKey(age)) {
      filters.push({ id: "ageing", value: [age] });
    }
    return filters;
  }, [searchParams]);

  if (user?.role !== "finance") {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to the finance accommodations view.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        description="Accommodation bookings and payments — read-only financial view."
      />
      <FinanceAccommodationsTable initialFilters={initialFilters} />
    </div>
  );
}

export default function FinanceAccommodationsPage() {
  return (
    <Suspense fallback={null}>
      <FinanceAccommodationsInner />
    </Suspense>
  );
}
