"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { isConvexConfigured } from "@/lib/convex-config";
import {
  AdminSessionFallbackProvider,
  AdminSessionProvider,
} from "@/components/admin/AdminSessionProvider";
import {
  RepSessionFallbackProvider,
  RepSessionProvider,
} from "@/components/portal/RepSessionProvider";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    if (!isConvexConfigured()) return null;
    return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }, []);

  // Always wrap with session providers so admin/portal pages can prerender/SSR
  // without throwing when NEXT_PUBLIC_CONVEX_URL is missing (common on
  // Production if the env var is only scoped to Preview).
  if (!convex) {
    return (
      <AdminSessionFallbackProvider>
        <RepSessionFallbackProvider>{children}</RepSessionFallbackProvider>
      </AdminSessionFallbackProvider>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <AdminSessionProvider>
        <RepSessionProvider>{children}</RepSessionProvider>
      </AdminSessionProvider>
    </ConvexProvider>
  );
}
