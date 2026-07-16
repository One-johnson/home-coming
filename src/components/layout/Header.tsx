"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Mountain } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { NAV_LINKS } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-cream bg-background/85 backdrop-blur-md">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/25 transition-colors group-hover:bg-gold/15">
            <Mountain className="h-5 w-5 text-accent" aria-hidden />
          </span>
          <div>
            <p className="font-display text-sm font-semibold text-primary">
              Mountain of the Lord
            </p>
            <p className="eyebrow mb-0 text-[0.65rem] text-stone">
              The Homecoming
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-foreground/80",
                )}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  buttonVariants({
                    variant: pathname === link.href ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  pathname !== link.href && "text-foreground/80",
                )}
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 lg:hidden"
                aria-label="Open menu"
              />
            }
          >
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] w-full gap-0 rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <div
              className="mx-auto mt-1 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
              aria-hidden
            />
            <SheetHeader className="px-2 pt-3 text-left">
              <SheetTitle className="font-display">The Homecoming</SheetTitle>
            </SheetHeader>
            <Separator className="my-3" />
            <nav
              className="flex flex-col gap-1 px-1 pb-2"
              aria-label="Mobile navigation"
            >
              {NAV_LINKS.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "min-h-12 justify-start text-base",
                    )}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      buttonVariants({
                        variant: pathname === link.href ? "secondary" : "ghost",
                      }),
                      "min-h-12 justify-start text-base",
                    )}
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
