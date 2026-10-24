import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/PortalShell";
import { CONFERENCE_NAME } from "@/lib/eventConfig";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  // Absolute so the root layout's "| Homecoming" template does not leak onto
  // the rep portal, which is branded with the conference's own name.
  ...createPageMetadata({
    title: "Representative portal",
    description: `Hub representatives: bulk registration and accommodation for the ${CONFERENCE_NAME} 2026.`,
    path: "/portal",
    noIndex: true,
  }),
  title: { absolute: `Representative portal | ${CONFERENCE_NAME}` },
};

export default function PortalPage() {
  return <PortalShell />;
}
