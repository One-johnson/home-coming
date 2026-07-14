"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BedDouble,
  Building2,
  ChevronsUpDown,
  ClipboardList,
  GalleryHorizontalEnd,
  LayoutDashboard,
  LogOut,
  Mail,
  Newspaper,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  ROLE_LABELS,
  canAccessArea,
  isAdminRole,
  type AdminArea,
  type AdminRole,
} from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  area?: AdminArea;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  {
    href: "/admin/registrations",
    label: "Registrations",
    icon: ClipboardList,
    area: "registration",
  },
  {
    href: "/admin/bookings",
    label: "Bookings",
    icon: BedDouble,
    area: "accommodation",
  },
  {
    href: "/admin/housing",
    label: "Housing",
    icon: Building2,
    area: "accommodation",
  },
  {
    href: "/admin/content",
    label: "Content",
    icon: Newspaper,
    area: "content",
  },
  {
    href: "/admin/galleries",
    label: "Galleries",
    icon: GalleryHorizontalEnd,
    area: "content",
  },
  { href: "/admin/emails", label: "Emails", icon: Mail, area: "emails" },
  { href: "/admin/team", label: "Team", icon: Users, area: "team" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, area: "audit" },
];

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
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold/20 text-xs font-semibold text-gold-light",
        className,
      )}
    >
      {getInitials(name, email)}
    </div>
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

function AdminSidebar({
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
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => !item.area || canAccessArea(role, item.area),
  );

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
                <span className="truncate font-semibold">Admin Console</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {EVENT.subtitle}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
  const pathname = usePathname();

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

  const title =
    pathname.startsWith("/admin/profile")
      ? "Profile"
      : (NAV_ITEMS.find((item) =>
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href),
        )?.label ?? "Admin");

  const signOut = async () => {
    await clearSession();
    toast.info("Signed out");
  };

  return (
    <SidebarProvider defaultOpen className="max-w-full overflow-x-hidden">
      <AdminSidebar
        name={user.name}
        email={user.email}
        role={user.role}
        onSignOut={signOut}
      />
      <SidebarInset className="min-w-0 overflow-x-hidden bg-neutral-100">
        <header className="sticky top-0 z-20 flex h-14 w-full min-w-0 shrink-0 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur supports-backdrop-filter:bg-white/80 sm:px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px shrink-0 bg-border" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Homecoming Admin
            </p>
            <h1 className="truncate text-sm font-semibold tracking-tight text-ink sm:text-base">
              {title}
            </h1>
          </div>
          <AdminCommandPalette />
          <span className="hidden shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
            {ROLE_LABELS[user.role]}
          </span>
        </header>
        <div className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
