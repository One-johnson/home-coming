"use client";

import { ArrivalPage } from "@/components/admin/agc/ArrivalPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ARRIVAL_ROLES } from "@/lib/adminRoles";

/**
 * Phase 2 Accommodation Check-In Module (§10–20) plus the operational
 * dashboards (§21–23). Open to admins, accommodation managers, room-assignment
 * staff and check-in staff — not the read-only volunteers.
 */
export default function AdminArrivalPage() {
  const { user } = useAdminSession();
  if (!user || !ARRIVAL_ROLES.includes(user.role)) {
    return (
      <p className="text-sm text-muted-foreground">
        The arrival desk is available to admins, accommodation, room-assignment and
        check-in staff.
      </p>
    );
  }

  return (
    <>
      <AdminPageHeader description="Accommodation check-in for arrival day — search delegates, check them in with wristband/keys handled, and keep serving even when the internet drops." />
      <ArrivalPage />
    </>
  );
}
