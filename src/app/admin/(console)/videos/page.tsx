"use client";

import { VideoManager } from "@/components/admin/VideoManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminVideosPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "content")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to videos.
      </p>
    );
  }

  return <VideoManager />;
}
