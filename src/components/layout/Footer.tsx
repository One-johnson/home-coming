import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { EVENT } from "@/lib/eventConfig";

const footerLinkClassName =
  "text-white/90 underline-offset-4 transition hover:text-gold-light hover:underline";

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t-2 border-gold/40 bg-section-dark text-white">
      <div
        className="bg-dots pointer-events-none absolute inset-0 opacity-[0.1]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="font-display text-xl font-medium text-gold-light">
              {EVENT.name}
            </h3>
            <p className="mt-1 font-body text-sm text-white/90">{EVENT.subtitle}</p>
            <p className="mt-4 font-body text-sm text-white/85">
              {EVENT.dates} · {EVENT.venue}, {EVENT.location}
            </p>
          </div>
          <div>
            <h4 className="eyebrow eyebrow-light mb-0 text-[0.65rem]">Quick Links</h4>
            <ul className="mt-3 space-y-2 font-body text-sm">
              <li>
                <Link href="/registration" className={footerLinkClassName}>
                  Register
                </Link>
              </li>
              <li>
                <Link href="/accommodation" className={footerLinkClassName}>
                  Book Accommodation
                </Link>
              </li>
              <li>
                <Link href="/faqs" className={footerLinkClassName}>
                  FAQs
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="eyebrow eyebrow-light mb-0 text-[0.65rem]">Contact</h4>
            <p className="mt-3 font-body text-sm">
              <a
                href={`mailto:${EVENT.supportEmail}`}
                className={footerLinkClassName}
              >
                {EVENT.supportEmail}
              </a>
            </p>
          </div>
        </div>
        <Separator className="my-10 bg-white/10" />
        <div className="text-center font-body text-sm text-white/75">
          © {new Date().getFullYear()} The Homecoming Convention. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
