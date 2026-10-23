"use client";

import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * One profile menu, two homes: the portal header (the avatar chip) and the
 * sidebar footer (the full name + hub row). Signing out lives in here instead
 * of a bare icon button, next to who is signed in.
 */

export type RepProfileIdentity = {
  hubName: string;
  firstName: string;
  lastName: string;
  email: string;
};

function initials(rep: RepProfileIdentity) {
  const first = rep.firstName?.trim()[0] ?? "";
  const last = rep.lastName?.trim()[0] ?? "";
  return (first + last).toUpperCase() || rep.hubName.trim()[0]?.toUpperCase() || "R";
}

function RepAvatar({
  rep,
  className,
}: {
  rep: RepProfileIdentity;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold-dark",
        className,
      )}
    >
      {initials(rep)}
    </span>
  );
}

export function RepProfileMenu({
  rep,
  onSignOut,
  variant = "header",
  align = "end",
  className,
}: {
  rep: RepProfileIdentity;
  onSignOut: () => void;
  /** header = avatar chip; sidebar = full-width footer row. */
  variant?: "header" | "sidebar";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const name = `${rep.firstName} ${rep.lastName}`.trim() || rep.hubName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Open profile menu — ${name}, ${rep.hubName}`}
        title={variant === "sidebar" ? `${name} · ${rep.hubName}` : undefined}
        className={cn(
          variant === "sidebar"
            ? "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-sidebar-foreground outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            : "inline-flex items-center gap-1.5 rounded-lg border border-border bg-white p-1 text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-10",
          className,
        )}
      >
        <RepAvatar rep={rep} />
        {variant === "sidebar" ? (
          <>
            <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {rep.hubName}
              </span>
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </>
        ) : (
          <>
            <span className="hidden max-w-28 truncate text-xs font-medium text-foreground sm:block">
              {name}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-60">
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <RepAvatar rep={rep} className="size-9" />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {rep.hubName}
            </span>
            <span className="truncate text-[11px] font-normal text-muted-foreground">
              {rep.email}
            </span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={onSignOut}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
