"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useIsCompact } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

function CommandBody({
  q,
  setQ,
  pages,
  registrations,
  bookings,
  go,
}: {
  q: string;
  setQ: (value: string) => void;
  pages: { href: string; label: string }[];
  registrations: { _id: string; label: string; sub: string }[];
  bookings: { _id: string; label: string; sub: string }[];
  go: (href: string) => void;
}) {
  return (
    <Command className="bg-transparent" shouldFilter={false}>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Command.Input
          value={q}
          onValueChange={setQ}
          placeholder="Search pages, registrations, bookings…"
          className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
      <Command.List className="max-h-[min(24rem,55dvh)] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
          {q.trim().length < 2 ? "Type at least 2 characters" : "No matches"}
        </Command.Empty>

        {pages.length > 0 && (
          <Command.Group
            heading="Pages"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {pages.map((page) => (
              <Command.Item
                key={page.href}
                value={page.label}
                onSelect={() => go(page.href)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center rounded-md px-2 py-2.5 text-sm aria-selected:bg-muted",
                )}
              >
                {page.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {registrations.length > 0 && (
          <Command.Group
            heading="Registrations"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {registrations.map((r) => (
              <Command.Item
                key={r._id}
                value={r.label}
                onSelect={() => go(`/admin/registrations?id=${r._id}`)}
                className="flex min-h-11 cursor-pointer flex-col rounded-md px-2 py-2.5 text-sm aria-selected:bg-muted"
              >
                <span>{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.sub}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {bookings.length > 0 && (
          <Command.Group
            heading="Bookings"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {bookings.map((b) => (
              <Command.Item
                key={b._id}
                value={b.label}
                onSelect={() => go(`/admin/bookings?id=${b._id}`)}
                className="flex min-h-11 cursor-pointer flex-col rounded-md px-2 py-2.5 text-sm aria-selected:bg-muted"
              >
                <span>{b.label}</span>
                <span className="text-xs text-muted-foreground">{b.sub}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}

export function AdminCommandPalette({
  className,
}: {
  className?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const isCompact = useIsCompact();
  const { sessionToken } = useAdminSession();
  const results = useQuery(
    api.admin.searchQuick,
    open && sessionToken && q.trim().length >= 2
      ? { sessionToken, q }
      : "skip",
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const pages = useMemo(() => results?.pages ?? [], [results]);
  const registrations = results?.registrations ?? [];
  const bookings = results?.bookings ?? [];

  const body = (
    <CommandBody
      q={q}
      setQ={setQ}
      pages={pages}
      registrations={registrations}
      bookings={bookings}
      go={go}
    />
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground",
          "w-9 justify-center sm:w-56 sm:justify-start lg:w-72",
          className,
        )}
        aria-label="Search"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden flex-1 truncate text-left sm:inline">
          Search pages & records…
        </span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>

      {isCompact ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[90dvh] gap-0 overflow-hidden rounded-t-2xl p-0"
            showCloseButton={false}
          >
            <div
              className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
              aria-hidden
            />
            <SheetHeader className="sr-only">
              <SheetTitle>Command palette</SheetTitle>
              <SheetDescription>Jump to a page or record</SheetDescription>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="gap-0 overflow-hidden p-0 sm:max-w-lg"
            showCloseButton={false}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Command palette</DialogTitle>
              <DialogDescription>Jump to a page or record</DialogDescription>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
