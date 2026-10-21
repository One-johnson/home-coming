"use client";

import { OpsReportsPage } from "@/components/admin/agc/OpsReportsPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

/**
 * Phase 2 §24 operational exports — administrators with accommodation or
 * finance scope.
 */
export default function AdminReportsPage() {
  const { user } = useAdminSession();
  const allowed =
    user?.role === "admin" ||
    user?.role === "accommodation" ||
    canAccessArea(user?.role, "audit");
  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        Operational reports are available to admins, accommodation and finance.
      </p>
    );
  }
  return (
    <>
      <AdminPageHeader description="Operational exports — every report supports the accommodation type, building and gender filters. Excel first; print any live view for PDF." />
      <OpsReportsPage />
    </>
  );
}
