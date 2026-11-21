"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  BedDouble,
  CalendarDays,
  ChevronsUpDown,
  ExternalLink,
  FileSpreadsheet,
  GalleryHorizontalEnd,
  Hotel,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPin,
  Newspaper,
  ScrollText,
  Settings,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { PageGuide } from "@/components/admin/PageGuide";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { SessionExpiryBanner } from "@/components/auth/SessionExpiryBanner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  ADMIN_NAV_GROUPS,
  getAdminPageMeta,
  type AdminNavItem,
} from "@/lib/adminNav";
import {
  ROLE_LABELS,
  canAccessArea,
  isAdminRole,
  isValidStaffRole,
  type StaffRole,
} from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "/admin": LayoutDashboard,
  "/admin/registrations": FileSpreadsheet,
  "/admin/accommodation": BedDouble,
  "/admin/directory": MapPin,
  "/admin/hubs-reps": Inbox,
  "/admin/groups": CalendarDays,
  "/admin/hotels": Hotel,
  "/admin/tours": CalendarDays,
  "/admin/content": Newspaper,
  "/admin/videos": Video,
  "/admin/galleries": GalleryHorizontalEnd,
  "/admin/team": Users,
  "/admin/audit": ScrollText,
  "/admin/settings": Settings,
};

type NavBadges = {
  registrationsPending: number;
  bookingsPending: number;
};

function daysUntilEvent() {
  const diff = EVENT.startDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  if (parts[0]?.[0]) return parts[0][0]!.toUpperCase();
  return (email[0] ?? "A").toUpperCase();
}

function UserAvatar({
  name,
  email,
  className,
}: {
  name: string;
  email: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-xs font-semibold text-[#2b1b12]",
        className,
      )}
    >
      {getInitials(name, email)}
    </div>
  );
}

function HeaderUserMenu({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email: string;
  role: StaffRole;
  onSignOut: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-9 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <UserAvatar name={name} email={email} className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 rounded-lg" align="end" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <UserAvatar name={name} email={email} />
              <div className="grid flex-1 leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[role]}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/admin/profile")}>
            <UserRound />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onSignOut}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavUserMenu({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email: string;
  role: StaffRole;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding]",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground",
              "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!",
              "h-12",
            )}
          >
            <UserAvatar name={name} email={email} />
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserAvatar name={name} email={email} />
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  router.push("/admin/profile");
                }}
              >
                <UserRound />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  onSignOut();
                }}
              >
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function navBadgeCount(item: AdminNavItem, badges?: NavBadges | null) {
  if (!item.badgeKey || !badges) return 0;
  return badges[item.badgeKey] ?? 0;
}

function AdminSidebar({
  name,
  email,
  role,
  onSignOut,
  badges,
}: {
  name: string;
  email: string;
  role: StaffRole;
  onSignOut: () => void;
  badges?: NavBadges | null;
}) {
  const pathname = usePathname();
  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.area && !canAccessArea(role, item.area)) return false;
      // Venue staff only see items explicitly opened to them; never the
      // area-less Overview entry.
      if (!isAdminRole(role) && !item.area && !item.visibleTo?.includes(role)) {
        return false;
      }
      if (item.visibleTo && !item.visibleTo.includes(role)) return false;
      if (item.hiddenFrom?.includes(role)) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-2 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={EVENT.name}
              render={<Link href="/admin" />}
            >
              <Image
                src="/dhmm.png"
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0 object-contain"
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold leading-snug text-sidebar-accent-foreground">
                  {EVENT.name}
                </span>
                <span className="truncate text-xs text-gold-light/80">
                  Admin · {EVENT.dates}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname.startsWith(item.href);
                  const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
                  const count = navBadgeCount(item, badges);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                        className={cn(
                          "h-9 text-sidebar-foreground/75 transition-colors",
                          active &&
                            "font-medium text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--gold-light)] [&_svg]:text-gold-light",
                        )}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {count > 0 ? (
                        <SidebarMenuBadge className="rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900">
                          {count > 99 ? "99+" : count}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUserMenu
          name={name}
          email={email}
          role={role}
          onSignOut={onSignOut}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Venue staff have exactly one workspace. Room-assignment and check-in staff
 * run the arrival desk; accommodation volunteers only read the directory.
 */
function staffHomePath(role: StaffRole): string {
  return role === "accommodation_volunteer"
    ? "/admin/directory"
    : "/admin/arrival";
}

function VenueStaffRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(to);
  }, [router, to]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
      Opening your workspace…
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, isReady, sessionToken, clearSession, sessionExpiresAt } =
    useAdminSession();
  const sessionArgs = useSessionArgs();
  const pathname = usePathname();
  // Badge counts only — the full dashboard overview stays on /admin, so a page
  // that never shows it stops re-aggregating every table on every write.
  const badges = useQuery(
    api.admin.getNavBadges,
    isReady &&
      user &&
      isAdminRole(user.role) &&
      // Dashboard-only accounts have no sidebar badges to feed.
      user.role !== "dashboard" &&
      sessionArgs
      ? sessionArgs
      : "skip",
  );

  // While the stored session token is still being validated (currentUser query
  // in flight), keep showing the loader instead of flashing the sign-in screen.
  const sessionValidating = Boolean(sessionToken) && user === undefined;

  if (!isReady || sessionValidating) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading admin console...
      </div>
    );
  }

  if (!user) {
    return <AdminSignIn />;
  }

  if (!isAdminRole(user.role)) {
    // Venue staff work only in their own workspace; any other
    // console URL sends them back there.
    if (isValidStaffRole(user.role)) {
      const home = staffHomePath(user.role);
      const staffWorkspace =
        pathname === home ||
        pathname.startsWith(`${home}/`);
      if (!staffWorkspace) {
        return <VenueStaffRedirect to={home} />;
      }
    } else {
      return (
        <div className="flex min-h-svh items-center justify-center bg-background px-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-elevate">
            <h1 className="font-display text-2xl">No admin access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as {user.email}, but no staff role is assigned.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={async () => {
                await clearSession();
                toast.info("Signed out");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      );
    }
  }

  // Dashboard-only accounts get the overview, their own account page — every other console URL sends them back to the dashboard.
  if (user.role === "dashboard") {
    const dashboardPaths =
      pathname === "/admin" ||
      pathname === "/admin/profile";
    if (!dashboardPaths) {
      return <VenueStaffRedirect to="/admin" />;
    }
  }

  const signOut = async () => {
    await clearSession();
    toast.info("Signed out");
  };

  // `clip` rather than `hidden` on both this wrapper and the inset: an
  // `overflow-x: hidden` box is a scrollport, and every `sticky` inside it then
  // pins to that box instead of the page — so filter bars never stayed put.
  return (
    <SidebarProvider defaultOpen className="max-w-full overflow-x-clip">
      <SessionExpiryBanner
        expiresAt={sessionExpiresAt}
        onSignOut={() => void signOut()}
      />
      <AdminConsoleFrame
        name={user.name}
        email={user.email}
        role={user.role}
        onSignOut={signOut}
        badges={badges}
      >
        {children}
      </AdminConsoleFrame>
    </SidebarProvider>
  );
}

function AdminConsoleFrame({
  name,
  email,
  role,
  onSignOut,
  badges,
  children,
}: {
  name: string;
  email: string;
  role: StaffRole;
  onSignOut: () => void;
  badges?: NavBadges | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const pageMeta = getAdminPageMeta(pathname);
  const daysLeft = daysUntilEvent();

  const headerLeft =
    isMobile || state === "collapsed"
      ? isMobile
        ? "0px"
        : "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";

  return (
    <>
      <AdminSidebar
        name={name}
        email={email}
        role={role}
        onSignOut={onSignOut}
        badges={badges}
      />
      <SidebarInset className="min-w-0 overflow-x-clip bg-background">
        <header
          className="fixed top-0 right-0 z-30 border-b bg-background/85 shadow-[0_1px_0_0_color-mix(in_srgb,var(--gold)_25%,transparent)] backdrop-blur-md transition-[left] duration-200 ease-linear"
          style={{ left: headerLeft }}
        >
          <div className="flex h-14 w-full min-w-0 items-center gap-2 px-4 sm:px-6">
            <SidebarTrigger className="-ml-1 text-muted-foreground" />
            <div className="min-w-0 flex-1 pl-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight">
                {pageMeta.title}
              </h1>
              <p className="hidden truncate text-xs leading-tight text-muted-foreground md:block">
                {pageMeta.description}
              </p>
            </div>

            {/* Event countdown, only while there is something to count down to. */}
            {daysLeft > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground lg:inline-flex">
                <CalendarDays className="size-3.5" />
                <span className="font-medium tabular-nums text-foreground">
                  {daysLeft} days
                </span>
                to go
              </span>
            )}

            {/* The palette searches registrations and bookings, which only
                console admins may read — venue staff get their own search. */}
            {isAdminRole(role) && role !== "dashboard" && (
              <AdminCommandPalette />
            )}

            {/* How-to for whichever page is open (see lib/adminGuides). */}
            <PageGuide />

            <Button
              size="icon-sm"
              variant="ghost"
              className="hidden text-muted-foreground sm:inline-flex"
              aria-label="View public site"
              title="View public site"
              nativeButton={false}
              render={<Link href="/" target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink className="size-4" />
            </Button>

            <HeaderUserMenu
              name={name}
              email={email}
              role={role}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        {/* overflow-x-clip, not hidden: hidden makes this a scroll container,
            which silently disables position: sticky in every admin page. */}
        <div className="min-w-0 flex-1 overflow-x-clip px-4 pt-[4.75rem] pb-6 sm:px-6 lg:px-8 lg:pb-10">
          {/* Keyed by route so each page rises in on navigation. */}
          <div key={pathname} className="admin-rise mx-auto w-full max-w-[1440px]">
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
