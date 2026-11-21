import { AdminShell } from "@/components/admin/AdminShell";

// Admin console is session-gated; never statically prerender.
export const dynamic = "force-dynamic";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `admin-theme` switches the console to its own neutral tokens (globals.css);
  // `contents` keeps the wrapper out of the layout.
  return (
    <div className="admin-theme contents">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
