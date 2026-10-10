"use client";

import { DeskCheckinPage } from "@/components/admin/agc/DeskCheckinPage";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";

export default function AdminDeskCheckinPage() {
  const { user } = useAdminSession();
  if (user?.role !== "admin" && user?.role !== "finance") {
    return (
      <p className="text-sm text-muted-foreground">
        The venue desk check-in is available to admins and finance.
      </p>
    );
  }

  return (
    <>
      <AdminPageHeader description="Payment-on-arrival cash collection at the door — search by reference, hub or guest, tick rows off as cash arrives, and confirm each payment with one tap." />
      <DeskCheckinPage />
    </>
  );
}
