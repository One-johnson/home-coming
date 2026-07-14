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
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { cn } from "@/lib/utils";

export function AdminCommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:inline-flex"
      >
        <Search className="size-3.5" />
        <span>Search</span>
        <kbd className="ml-2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription>Jump to a page or record</DialogDescription>
          </DialogHeader>
          <Command className="bg-transparent" shouldFilter={false}>
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search pages, registrations, bookings…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                {q.trim().length < 2
                  ? "Type at least 2 characters"
                  : "No matches"}
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
                        "flex cursor-pointer items-center rounded-md px-2 py-2 text-sm aria-selected:bg-muted",
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
                      className="flex cursor-pointer flex-col rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                    >
                      <span>{r.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.sub}
                      </span>
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
                      className="flex cursor-pointer flex-col rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                    >
                      <span>{b.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.sub}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
