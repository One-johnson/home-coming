import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentSuccess } from "@/components/payments/PaymentSuccess";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Payment confirmed",
  description: "Your representative portal payment is confirmed.",
  path: "/portal/success",
  noIndex: true,
});

export default function PortalSuccessPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <Suspense
        fallback={<p className="text-center text-muted-foreground">Loading…</p>}
      >
        <PaymentSuccess
          title="Payment confirmed"
          description="Your Homecoming 2026 purchase is confirmed. You can review it in the portal."
          backHref="/portal"
          backLabel="Back to portal"
        />
      </Suspense>
    </div>
  );
}
