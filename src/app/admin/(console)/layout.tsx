import { AdminShell } from "@/components/admin/AdminShell";

// Admin console is session-gated; never statically prerender.
export const dynamic = "force-dynamic";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
