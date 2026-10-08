"use client";

import { use, useMemo } from "react";
import { notFound } from "next/navigation";
import {
  AgcSettingsManager,
} from "@/components/admin/agc/AgcSettingsManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

/**
 * One settings section per route: /admin/settings/general, /payments,
 * /accommodation, /titles and /operations each render only their own card
 * instead of one long scrolling page.
 */
const SECTION_IDS = [
  "general",
  "payments",
  "accommodation",
  "titles",
  "poa",
  "operations",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

export default function AdminSettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = use(params);
  const { user } = useAdminSession();
  const valid = useMemo(
    () => (SECTION_IDS as readonly string[]).includes(section),
    [section],
  );

  if (!valid) notFound();

  if (!canAccessArea(user?.role, "settings")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to settings.
      </p>
    );
  }

  return <AgcSettingsManager section={section as SectionId} />;
}
