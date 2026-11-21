import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AdminResetPassword } from "@/components/admin/AdminResetPassword";
import { CONFERENCE_MONOGRAM, EVENT } from "@/lib/eventConfig";

export const metadata: Metadata = {
  title: "Admin password reset",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminResetPasswordPage() {
  return (
    <AuthShell brand={EVENT.name} monogram={CONFERENCE_MONOGRAM} eyebrow="Admin console">
      <Suspense
        fallback={
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        }
      >
        <AdminResetPassword />
      </Suspense>
    </AuthShell>
  );
}
