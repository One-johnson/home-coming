"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, HandCoins } from "lucide-react";
import type { ColumnFiltersState } from "@tanstack/react-table";
import RegistrationsTab, {
  AgcExcelExportButton,
} from "@/components/admin/agc/AgcAdminClient";
import { PoaTab } from "@/components/admin/agc/PoaTab";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { isAgeingBucketKey } from "@/lib/agcPortal";
import { canAccessArea } from "@/lib/adminRoles";
import {
  SectionTabs,
  useUrlSection,
} from "@/components/admin/kit/SectionTabs";

const PAYMENT_STATUSES = [
  "awaiting_payment",
  "pending_verification",
  "correction_requested",
  "rejected",
  "confirmed",
] as const;

type PageSection = "registrations" | "poa";

/**
 * Drill-down target for the finance overview stat cards — URLs like
 * /admin/registrations?status=pending_verification&age=7plus land here and
 * seed the table's facet filters so the review queue opens pre-filtered.
 */
function AdminRegistrationsInner() {
  const { user } = useAdminSession();
  const searchParams = useSearchParams();
  const showPoa = user?.role === "admin" || user?.role === "finance";
  // ?tab=poa deep link (finance overview card / attention banner); the open
  // tab stays in the URL.
  const [urlSection, setSection] = useUrlSection<PageSection>(
    ["registrations", "poa"],
    "registrations",
  );
  const section: PageSection = showPoa ? urlSection : "registrations";

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
          section === "registrations" ? (
            <AgcExcelExportButton
              which="registrations"
              label="Export registrations (.xlsx)"
            />
          ) : undefined
        }
      />

      {showPoa && (
        <SectionTabs
          label="Registration sections"
          value={section}
          onChange={setSection}
          items={[
            { id: "registrations", label: "Registrations", icon: ClipboardList },
            { id: "poa", label: "Payment on arrival", icon: HandCoins },
          ]}
        />
      )}

      {section === "registrations" || !showPoa ? (
        <RegistrationsTab initialFilters={initialFilters} />
      ) : (
        <PoaTab kind="registration" />
      )}
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
