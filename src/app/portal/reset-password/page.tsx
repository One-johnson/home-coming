import { Suspense } from "react";
import type { Metadata } from "next";
import { RepAuthShell } from "@/components/portal/RepAuthShell";
import { RepResetPassword } from "@/components/portal/RepResetPassword";
import { CONFERENCE_NAME } from "@/lib/eventConfig";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Representative password reset",
    description: `Reset your ${CONFERENCE_NAME} representative portal password.`,
    path: "/portal/reset-password",
    noIndex: true,
  }),
  title: { absolute: `Password reset | ${CONFERENCE_NAME}` },
};

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
