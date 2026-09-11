"use client";

import { HeroManager } from "@/components/admin/HeroManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminHeroPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "content")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to hero content.
      </p>
    );
  }

  return <HeroManager />;
}
