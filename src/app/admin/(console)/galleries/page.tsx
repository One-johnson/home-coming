"use client";

import { GalleryManager } from "@/components/admin/GalleryManager";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminGalleriesPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "content")) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to galleries.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Galleries</h2>
        <p className="text-sm text-muted-foreground">
          Manage gallery albums and upload photos.
        </p>
      </div>
      <GalleryManager />
    </div>
  );
}
