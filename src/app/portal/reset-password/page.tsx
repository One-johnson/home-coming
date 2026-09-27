import { Suspense } from "react";
import type { Metadata } from "next";
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
    <div className="mx-auto w-full max-w-6xl px-4 py-16">
      <header className="mb-8 text-center">
        <h1 className="font-display text-3xl text-primary sm:text-4xl">
          Representative Portal
        </h1>
      </header>
      <Suspense fallback={null}>
        <RepResetPassword />
      </Suspense>
    </div>
  );
}
