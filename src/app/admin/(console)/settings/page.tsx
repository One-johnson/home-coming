import { redirect } from "next/navigation";

/**
 * Settings used to be one long page; each section now lives on its own
 * route under /admin/settings/*. Land on the first section.
 */
export default function AdminSettingsPage() {
  redirect("/admin/settings/general");
}
