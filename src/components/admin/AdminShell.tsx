"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  ClipboardList,
  ExternalLink,
  GalleryHorizontalEnd,
  LayoutDashboard,
  LogOut,
  Mail,
  Newspaper,
  ScrollText,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
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
  SidebarSeparator,
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
  type AdminRole,
} from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "/admin": LayoutDashboard,
  "/admin/registrations": ClipboardList,
  "/admin/bookings": BedDouble,
  "/admin/housing": Building2,
  "/admin/content": Newspaper,
  "/admin/videos": Video,
  "/admin/galleries": GalleryHorizontalEnd,
  "/admin/emails": Mail,
  "/admin/team": Users,
  "/admin/audit": ScrollText,
};

type NavBadges = {
  registrationsPending: number;
  bookingsPending: number;
  emailsFailed: number;
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
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/20 text-xs font-semibold text-gold-dark",
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
  role: AdminRole;
  onSignOut: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <UserAvatar name={name} email={email} className="size-7 rounded-md" />
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
  role: AdminRole;
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
  role: AdminRole;
  onSignOut: () => void;
  badges?: NavBadges | null;
}) {
  const pathname = usePathname();
  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.area || canAccessArea(role, item.area),
    ),
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
                <span className="truncate font-semibold">Homecoming</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  Admin console
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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
                          active &&
                            "bg-sidebar-accent font-medium shadow-[inset_3px_0_0_0_var(--color-gold-light,#d4af37)]",
                        )}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {count > 0 ? (
                        <SidebarMenuBadge className="bg-amber-100 text-amber-900">
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, isReady, clearSession } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const overview = useQuery(
    api.admin.getOverview,
    isReady && user && isAdminRole(user.role) && sessionArgs
      ? sessionArgs
      : "skip",
  );

  if (!isReady) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-100 text-sm text-muted-foreground">
        Loading admin console...
      </div>
    );
  }

  if (!user) {
    return <AdminSignIn />;
  }

  if (!isAdminRole(user.role)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-100 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-elevate">
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

  const signOut = async () => {
    await clearSession();
    toast.info("Signed out");
  };

  return (
    <SidebarProvider defaultOpen className="max-w-full overflow-x-hidden">
      <AdminConsoleFrame
        name={user.name}
        email={user.email}
        role={user.role}
        onSignOut={signOut}
        badges={overview?.badges}
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
  role: AdminRole;
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
                {pageMeta.title}
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {pageMeta.description}
              </p>
            </div>

            <AdminCommandPalette />

            <Button
              size="sm"
              variant="outline"
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link href="/" target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden md:inline">View site</span>
            </Button>

            <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground lg:flex">
              <CalendarDays className="size-3.5 text-gold-dark" />
              <span className="font-medium text-foreground tabular-nums">
                {daysLeft}d
              </span>
              <span className="hidden xl:inline">· {EVENT.dates}</span>
            </div>

            <Badge
              variant="outline"
              className="hidden shrink-0 border-gold/40 bg-gold/10 text-ink sm:inline-flex"
            >
              {ROLE_LABELS[role]}
            </Badge>

            <HeaderUserMenu
              name={name}
              email={email}
              role={role}
              onSignOut={onSignOut}
            />
          </div>
        </header>
        <div className="min-w-0 flex-1 overflow-x-hidden px-4 pt-20 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}
