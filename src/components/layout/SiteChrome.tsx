"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { StickyMobileCTA } from "@/components/layout/StickyMobileCTA";
import { TEAM_SIGN_IN_PATHS } from "@/lib/teamLogins";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isPortal = pathname.startsWith("/portal");
  // Team sign-in routes are full-screen staff surfaces, like /admin.
  const isTeamSignIn = TEAM_SIGN_IN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const hideStickyCta =
    pathname.startsWith("/registration") || pathname.startsWith("/tours");

  if (isAdmin || isPortal || isTeamSignIn) {
    return <div className="min-h-svh bg-background">{children}</div>;
  }

  return (
    <div
      className={
        hideStickyCta
          ? "flex min-h-svh flex-col"
          : "flex min-h-svh flex-col pb-20 md:pb-0"
      }
    >
      <Header />
      <main className="min-w-0 flex-1">{children}</main>
      <Footer />
      <StickyMobileCTA />
    </div>
  );
}
