import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AgcAdminClient } from "@/components/admin/agc/AgcAdminClient";

export const metadata: Metadata = {
  title: "AGC 2026",
};

export default function AgcAdminPage() {
  return (
    <>
      <AdminPageHeader description="Rep portal: registrations, bookings, pools, and representatives" />
      <AgcAdminClient />
    </>
  );
}
