"use client";

import { useState } from "react";
import {
  BedDoubleIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import {
  RepFirstTimeSetup,
  RepSignIn,
} from "@/components/portal/RepAuthForms";
import { SessionExpiryBanner } from "@/components/auth/SessionExpiryBanner";
import { RepOverviewTab } from "@/components/portal/RepOverviewTab";
import { RepRegistrationTab } from "@/components/portal/RepRegistrationTab";
import { RepAccommodationTab } from "@/components/portal/RepAccommodationTab";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

type PortalTab = "overview" | "registration" | "accommodation";

const NAV_ITEMS: Array<{
  id: PortalTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboardIcon },
  { id: "accommodation", label: "Accommodation", icon: BedDoubleIcon },
  { id: "registration", label: "Registration", icon: ClipboardListIcon },
];

const NAV_TITLES: Record<PortalTab, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Your hub's registration and accommodation at a glance",
  },
  accommodation: {
    title: "Accommodation",
    description: "Book and manage rooms and beds for your hub",
  },
  registration: {
    title: "Registration",
    description: "Register delegates and manage payment receipts",
  },
};

function ConvexRequiredMessage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-elevate">
        <h1 className="font-display text-2xl text-ink">Portal unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The representative portal requires Convex. Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            npx convex dev
          </code>{" "}
          to enable it.
        </p>
      </div>
    </div>
  );
}

function PortalLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-100 text-sm text-muted-foreground">
      Loading your portal…
    </div>
  );
}

function PortalSignOutButton({
  className,
  onSignOut,
}: {
  className?: string;
  onSignOut: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSignOut}
      className={cn(
        "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-sidebar-foreground/80 outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      <LogOutIcon className="size-4 shrink-0" />
      <span>Sign out</span>
    </button>
  );
}

function PortalSidebar({
  rep,
  tab,
  onSelect,
  onSignOut,
}: {
  rep: {
    hubName: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  tab: PortalTab;
  onSelect: (tab: PortalTab) => void;
  onSignOut: () => void;
}) {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={EVENT.name}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/20 font-display text-sm font-bold text-gold-dark">
                H
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Homecoming 2026</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  Rep portal
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={tab === item.id}
                    tooltip={item.label}
                    onClick={() => onSelect(item.id)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-sm font-medium text-sidebar-foreground">
            {rep.hubName}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {rep.firstName} {rep.lastName}
          </p>
        </div>
        <PortalSignOutButton onSignOut={onSignOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function PortalBottomNav({
  tab,
  onSelect,
}: {
  tab: PortalTab;
  onSelect: (tab: PortalTab) => void;
}) {
  return (
    <nav
      aria-label="Portal navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_0_rgba(212,175,55,0.2)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium outline-none transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className={cn("size-5", active && "text-gold-dark")} />
              <span className={cn(active && "text-gold-dark")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PortalBody() {
  const {
    sessionToken,
    isReady,
    rep,
    setSession,
    clearSession,
    sessionExpiresAt,
  } = useRepSession();
  const [tab, setTab] = useState<PortalTab>("overview");

  if (!isReady) return <PortalLoading />;

  if (!sessionToken) return <RepSignIn />;

  if (rep === undefined) return <PortalLoading />;

  if (!rep) return <RepSignIn />;

  if (rep.profileComplete === false) {
    return (
      <RepFirstTimeSetup username={rep.username} onSetupComplete={setSession} />
    );
  }

  const signOut = () => {
    void clearSession();
    toast.success("You've been signed out. See you soon!");
  };

  const content = (
    <div className="space-y-6 pb-24 md:pb-0">
      <SessionExpiryBanner
        expiresAt={sessionExpiresAt}
        onSignOut={signOut}
      />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-primary">
            {rep.hubName}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {rep.firstName} {rep.lastName} · {rep.email} · Hub: {rep.username}
          </p>
        </div>
        <PortalSignOutButton
          className="w-full border border-border bg-white sm:hidden"
          onSignOut={signOut}
        />
      </div>
      {tab === "overview" && <RepOverviewTab />}
      {tab === "registration" && <RepRegistrationTab />}
      {tab === "accommodation" && <RepAccommodationTab />}
    </div>
  );

  return (
    <SidebarProvider>
      <PortalFrame
        rep={rep}
        tab={tab}
        onSelect={setTab}
        onSignOut={signOut}
      >
        {content}
      </PortalFrame>
    </SidebarProvider>
  );
}

function PortalFrame({
  rep,
  tab,
  onSelect,
  onSignOut,
  children,
}: {
  rep: {
    hubName: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  tab: PortalTab;
  onSelect: (tab: PortalTab) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const { isMobile } = useSidebar();
  const meta = NAV_TITLES[tab];

  if (isMobile) {
    // shadcn sidebar becomes a slide-in sheet on mobile — the bottom nav
    // replaces the permanent rail, and the header stays fixed on top.
    return (
      <SidebarInset className="min-w-0 overflow-x-hidden bg-neutral-100">
        <header className="fixed top-0 right-0 z-30 border-b border-border/80 bg-white/95 shadow-[0_1px_0_0_rgba(212,175,55,0.35)] backdrop-blur-md supports-backdrop-filter:bg-white/85">
          <div className="flex h-14 w-full min-w-0 items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-ink">
                {meta.title}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {meta.description}
              </p>
            </div>
          </div>
        </header>
        <div className="min-w-0 flex-1 px-3 pt-[72px] pb-4">{children}</div>
        <PortalBottomNav tab={tab} onSelect={onSelect} />
      </SidebarInset>
    );
  }

  return (
    <>
      <PortalSidebar
        rep={rep}
        tab={tab}
        onSelect={onSelect}
        onSignOut={onSignOut}
      />
      <SidebarInset className="min-w-0 overflow-x-hidden bg-neutral-100">
        <header className="fixed top-0 right-0 z-30 border-b border-border/80 bg-white/95 shadow-[0_1px_0_0_rgba(212,175,55,0.35)] backdrop-blur-md transition-[left] duration-200 ease-linear supports-backdrop-filter:bg-white/85">
          <div className="flex h-16 w-full min-w-0 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="h-5 w-px shrink-0 bg-border" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-ink">
                {meta.title}
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {meta.description}
              </p>
            </div>
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
              <span className="font-medium text-foreground">{rep.hubName}</span>
              <span>·</span>
              <span>Rep portal</span>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Sign out"
            >
              <LogOutIcon className="size-4" />
            </button>
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-hidden px-4 pt-20 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}

export function PortalShell() {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }

  // The real (or fallback) RepSessionProvider is mounted globally in
  // ConvexClientProvider — no need to nest another one here.
  return <PortalBody />;
}
