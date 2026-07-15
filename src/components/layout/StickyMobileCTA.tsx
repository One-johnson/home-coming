"use client";

import { usePathname } from "next/navigation";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Separator } from "@/components/ui/separator";

const HIDDEN_PATHS = ["/registration", "/accommodation"];

export function StickyMobileCTA() {
  const pathname = usePathname();
  const hidden = HIDDEN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (hidden) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cream bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <Separator />
      <div className="mx-auto flex max-w-lg gap-3 p-3">
        <Button
          href="/registration"
          className="min-h-11 flex-1 border-gold bg-gold py-2.5 text-sm text-ink hover:bg-gold-dark hover:text-ink"
        >
          Register
        </Button>
        <Button
          href="/accommodation"
          variant="outline"
          className="min-h-11 flex-1 border-2 border-gold bg-transparent py-2.5 text-sm text-ink hover:bg-gold/10 hover:text-ink"
        >
          Book Stay
        </Button>
      </div>
    </div>
  );
}
