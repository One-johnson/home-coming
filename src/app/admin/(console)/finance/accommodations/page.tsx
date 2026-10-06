"use client";

import FinanceAccommodationsTable from "@/components/admin/agc/FinanceAccommodationsTable";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";

/**
 * Finance-only accommodations view: the bookings money table without any
 * review actions. Approvals and deletions live in the accommodation console,
 * so this page is deliberately read-only.
 */
export default function FinanceAccommodationsPage() {
  const { user } = useAdminSession();
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
      <FinanceAccommodationsTable />
    </div>
  );
}
