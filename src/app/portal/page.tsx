import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/PortalShell";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Representative Portal",
  description:
    "Hub representatives: bulk registration and accommodation for AGC 2026 — The Homecoming.",
  path: "/portal",
  noIndex: true,
});

export default function PortalPage() {
  return <PortalShell />;
}
