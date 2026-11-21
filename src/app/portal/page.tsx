import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/PortalShell";
import { CONFERENCE_NAME } from "@/lib/eventConfig";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  // Absolute so the root layout's "| <event>" title template cannot drift from
  // the conference name the portal shows on screen.
  ...createPageMetadata({
    title: "Representative portal",
    description: `Hub representatives: bulk registration and accommodation for the ${CONFERENCE_NAME} 2026.`,
    path: "/portal",
    noIndex: true,
  }),
  title: { absolute: `Representative portal | ${CONFERENCE_NAME}` },
};

export default function PortalPage() {
  // Same neutral workspace theme as the admin console (globals.css).
  return (
    <div className="admin-theme contents">
      <PortalShell />
    </div>
  );
}
