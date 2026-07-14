import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
