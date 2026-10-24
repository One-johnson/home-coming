import { Suspense } from "react";
import type { Metadata } from "next";
import { RepAuthShell } from "@/components/portal/RepAuthShell";
import { RepResetPassword } from "@/components/portal/RepResetPassword";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Representative password reset",
  description: "Reset your Homecoming representative portal password.",
  path: "/portal/reset-password",
  noIndex: true,
});

export default function PortalResetPasswordPage() {
  return (
    <RepAuthShell>
      <Suspense
        fallback={
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        }
      >
        <RepResetPassword />
      </Suspense>
    </RepAuthShell>
  );
}
