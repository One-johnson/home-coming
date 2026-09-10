import { LegalDocument } from "@/components/legal/LegalDocument";
import { termsContent } from "@/lib/siteContent";

export default function TermsPage() {
  return (
    <div className="relative overflow-hidden bg-background py-24 md:py-28">
      <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LegalDocument content={termsContent} />
      </div>
    </div>
  );
}
