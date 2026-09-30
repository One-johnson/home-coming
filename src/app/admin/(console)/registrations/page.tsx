"use client";

import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import RegistrationsTab from "@/components/admin/agc/AgcAdminClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminRegistrationsPage() {
  const { user } = useAdminSession();
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
      <RegistrationsTab />
    </div>
  );
}
