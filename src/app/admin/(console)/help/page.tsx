"use client";

import { HelpRunbook } from "@/components/admin/HelpRunbook";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

/**
 * Arrival-day runbook, searchable — every console role (including venue
 * staff) can open it from the workstation they are manning.
 */
export default function AdminHelpPage() {
  return (
    <>
      <AdminPageHeader
        description="Arrival-day runbook, November 3, 2026 — import flow, desk check-in, keys, offline stations, and the end-of-day reports. Search it by keyword."
      />
      <HelpRunbook />
    </>
  );
}
