import { Section } from "@/components/ui/Section";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <Section subtitle="Administration" title="Team Dashboard" className="pt-24">
      <AdminDashboard />
    </Section>
  );
}
