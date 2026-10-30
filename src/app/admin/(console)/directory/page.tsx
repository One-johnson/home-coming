"use client";

import { DelegateDirectory } from "@/components/admin/agc/DelegateDirectory";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

/**
 * Read-only directory of reps, their delegates and the rooms they were given.
 * Accommodation volunteers live here on their phones; the accommodation team
 * gets the same view without switching to the room grid.
 */
export default function AdminDirectoryPage() {
  const { user } = useAdminSession();
  if (!canAccessArea(user?.role, "directory")) {
    return (
      <p className="text-sm text-muted-foreground">
        The delegate directory is available to the accommodation team and
        volunteers.
      </p>
    );
  }

  return (
    <>
      <AdminPageHeader description="Read-only: every rep with their delegates and rooms, to walk people to the right room. Filter by rep, building or room." />
      <DelegateDirectory />
    </>
  );
}
