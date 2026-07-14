"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { isConvexConfigured } from "@/lib/convex-config";
import {
  AdminSessionFallbackProvider,
  AdminSessionProvider,
} from "@/components/admin/AdminSessionProvider";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    if (!isConvexConfigured()) return null;
    return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }, []);

  // Always wrap with a session provider so admin pages can prerender/SSR
  // without throwing when NEXT_PUBLIC_CONVEX_URL is missing (common on
  // Production if the env var is only scoped to Preview).
  if (!convex) {
    return (
      <AdminSessionFallbackProvider>{children}</AdminSessionFallbackProvider>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <AdminSessionProvider>{children}</AdminSessionProvider>
    </ConvexProvider>
  );
}
