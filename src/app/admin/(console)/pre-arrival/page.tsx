"use client";

import { PreArrivalChecklist } from "@/components/admin/agc/PreArrivalChecklist";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";

export default function AdminPreArrivalPage() {
  const { user } = useAdminSession();
  if (
    user?.role !== "admin" &&
    user?.role !== "accommodation" &&
    user?.role !== "finance"
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        The pre-arrival checklist is available to admins, accommodation and
        finance.
      </p>
    );
  }

  return (
    <>
      <AdminPageHeader description="Everything the accommodation side needs before arrival day (§28–24): inventory imported against confirmed pools, EBPV apartments sane, rooms published, and delegates assigned. Fix what is flagged, then reload." />
      <PreArrivalChecklist />
    </>
  );
}
