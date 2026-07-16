import type { AdminArea } from "@/lib/adminRoles";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  area?: AdminArea;
  badgeKey?: "registrationsPending" | "bookingsPending" | "emailsFailed";
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/admin",
        label: "Overview",
        description: "KPIs, attention items, and activity",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        href: "/admin/registrations",
        label: "Registrations",
        description: "Search, filter, update payment status, and export",
        area: "registration",
        badgeKey: "registrationsPending",
      },
      {
        href: "/admin/bookings",
        label: "Bookings",
        description: "Review accommodation bookings and payments",
        area: "accommodation",
        badgeKey: "bookingsPending",
      },
      {
        href: "/admin/housing",
        label: "Housing",
        description: "Inventory, capacity, and pricing",
        area: "accommodation",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/content",
        label: "Content",
        description: "FAQs, stats, announcements, and about copy",
        area: "content",
      },
      {
        href: "/admin/videos",
        label: "Videos",
        description: "Homecoming message and video links",
        area: "content",
      },
      {
        href: "/admin/galleries",
        label: "Galleries",
        description: "Albums and photo uploads",
        area: "content",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/admin/emails",
        label: "Emails",
        description: "Delivery logs and stubs",
        area: "emails",
        badgeKey: "emailsFailed",
      },
      {
        href: "/admin/team",
        label: "Team",
        description: "Staff accounts and roles",
        area: "team",
      },
      {
        href: "/admin/audit",
        label: "Audit log",
        description: "Recent admin actions",
        area: "audit",
      },
    ],
  },
];

export const ADMIN_PROFILE_META = {
  href: "/admin/profile",
  label: "Profile",
  description: "Your account details and security",
} as const;

export function getAdminPageMeta(pathname: string): {
  title: string;
  description: string;
} {
  if (pathname.startsWith(ADMIN_PROFILE_META.href)) {
    return {
      title: ADMIN_PROFILE_META.label,
      description: ADMIN_PROFILE_META.description,
    };
  }

  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const match =
        item.href === "/admin"
          ? pathname === "/admin"
          : pathname.startsWith(item.href);
      if (match) {
        return { title: item.label, description: item.description };
      }
    }
  }

  return { title: "Admin", description: "Homecoming admin console" };
}

export function flattenAdminNavItems(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((group) => group.items);
}
