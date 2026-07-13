import { LinkButton as Button } from "@/components/ui/app-button";
import { Separator } from "@/components/ui/separator";

export function StickyMobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cream bg-background/95 backdrop-blur md:hidden">
      <Separator />
      <div className="mx-auto flex max-w-lg gap-3 p-3">
        <Button href="/registration" className="flex-1 py-2.5 text-xs">
          Register
        </Button>
        <Button
          href="/accommodation"
          variant="secondary"
          className="flex-1 py-2.5 text-xs"
        >
          Book Stay
        </Button>
      </div>
    </div>
  );
}
