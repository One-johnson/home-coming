"use client";

import { useEffect, useState } from "react";
import {
  BedDoubleIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
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
import { RepNotificationsBell } from "@/components/portal/RepNotificationsBell";
import { RepProfileMenu } from "@/components/portal/RepProfileMenu";
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

const PORTAL_TABS: PortalTab[] = ["overview", "registration", "accommodation"];

/**
 * The active tab lives in `?tab=` so a refresh, a bookmark or the browser's
 * back button keeps the rep where they were. Read lazily on the client only —
 * the shell renders "Loading your portal…" on the server either way.
 */
function tabFromUrl(): PortalTab | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("tab");
  return PORTAL_TABS.includes(value as PortalTab) ? (value as PortalTab) : null;
}

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
    username?: string;
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
                <span className="truncate font-semibold">{EVENT.name}</span>
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
        <RepProfileMenu
          rep={rep}
          onSignOut={onSignOut}
          variant="sidebar"
          align="start"
        />
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
  // ?tab= decides the first render, so a bookmark or refresh lands correctly.
  const [tab, setTab] = useState<PortalTab>(() => tabFromUrl() ?? "overview");
  // Cross-tab hand-off: "receipts in review" opens Registration already
  // filtered. `nonce` makes the same target fire again on a second click.
  const [intent, setIntent] = useState<{
    tab: PortalTab;
    filter?: string;
    nonce: number;
  } | null>(null);

  // Follow the back/forward buttons (they change the URL without a render).
  useEffect(() => {
    const onPopState = () => setTab(tabFromUrl() ?? "overview");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectTab = (next: PortalTab, filter?: string) => {
    setTab(next);
    setIntent(filter ? { tab: next, filter, nonce: Date.now() } : null);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

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
      <SessionExpiryBanner expiresAt={sessionExpiresAt} onSignOut={signOut} />
      {tab === "overview" && <RepOverviewTab onNavigate={selectTab} />}
      {tab === "registration" && (
        <RepRegistrationTab
          key={intent?.tab === "registration" ? `intent-${intent.nonce}` : "tab"}
          initialFilter={
            intent?.tab === "registration" ? intent.filter : undefined
          }
        />
      )}
      {tab === "accommodation" && (
        <RepAccommodationTab
          key={
            intent?.tab === "accommodation" ? `intent-${intent.nonce}` : "tab"
          }
          initialFilter={
            intent?.tab === "accommodation" ? intent.filter : undefined
          }
        />
      )}
    </div>
  );

  return (
    <SidebarProvider>
      <PortalFrame
        rep={rep}
        tab={tab}
        onSelect={(next, filter) => selectTab(next, filter)}
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
  onSelect: (tab: PortalTab, filter?: string) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const { isMobile, state } = useSidebar();
  const meta = NAV_TITLES[tab];

  // Anchor the fixed header to the sidebar edge so it spans the full width
  // of the content area (same pattern as AdminShell), and shrink it to the
  // icon rail width when the sidebar is collapsed.
  const headerLeft =
    isMobile || state === "collapsed"
      ? isMobile
        ? "0px"
        : "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";

  if (isMobile) {
    // shadcn sidebar becomes a slide-in sheet on mobile — the bottom nav
    // replaces the permanent rail, and the header stays fixed on top.
    return (
      <SidebarInset className="min-w-0 overflow-x-hidden bg-neutral-100">
        <header className="fixed top-0 right-0 z-30 border-b border-border/80 bg-white/95 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_0_rgba(212,175,55,0.35)] backdrop-blur-md supports-backdrop-filter:bg-white/85">
          <div className="flex h-14 w-full min-w-0 items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-ink">
                {meta.title}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {meta.description}
              </p>
            </div>
            <RepNotificationsBell onNavigate={onSelect} />
            <RepProfileMenu rep={rep} onSignOut={onSignOut} />
          </div>
        </header>
        <div className="min-w-0 flex-1 px-3 pt-[calc(env(safe-area-inset-top)+72px)] pb-4">{children}</div>
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
        <header
          className="fixed top-0 right-0 z-30 border-b border-border/80 bg-white/95 shadow-[0_1px_0_0_rgba(212,175,55,0.35)] backdrop-blur-md transition-[left] duration-200 ease-linear supports-backdrop-filter:bg-white/85"
          style={{ left: headerLeft }}
        >
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
            <RepNotificationsBell onNavigate={onSelect} />
            <RepProfileMenu rep={rep} onSignOut={onSignOut} />
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
