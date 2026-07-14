"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { isConvexConfigured } from "@/lib/convex-config";
import { AdminSessionProvider } from "@/components/admin/AdminSessionProvider";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    if (!isConvexConfigured()) return null;
    return new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }, []);

  if (!convex) {
    return <>{children}</>;
  }

  return (
    <ConvexProvider client={convex}>
      <AdminSessionProvider>{children}</AdminSessionProvider>
    </ConvexProvider>
  );
}
