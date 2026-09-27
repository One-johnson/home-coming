import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminResetPassword } from "@/components/admin/AdminResetPassword";

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
    <div className="flex min-h-svh items-center justify-center bg-neutral-800 px-4 py-16">
      <Suspense fallback={null}>
        <AdminResetPassword />
      </Suspense>
    </div>
  );
}
