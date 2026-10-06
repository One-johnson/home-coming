import type { AdminArea, AdminRole } from "@/lib/adminRoles";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  area?: AdminArea;
  badgeKey?: "registrationsPending" | "bookingsPending" | "emailsFailed";
  /** Show the item only for these roles (after the area check passes). */
  visibleTo?: readonly AdminRole[];
  /** Never show the item for these roles, even if the area check passes. */
  hiddenFrom?: readonly AdminRole[];
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
        description: "Review hub registrations and offline payments",
        area: "registration",
        badgeKey: "registrationsPending",
      },
      {
        href: "/admin/accommodation",
        label: "Accommodation",
        description: "Bookings review and capacity pools",
        area: "accommodation",
        badgeKey: "bookingsPending",
      },
      {
        href: "/admin/finance/accommodations",
        label: "Accommodations",
        description: "Finance view of bookings and payments",
        visibleTo: ["finance"],
      },
      {
        href: "/admin/hubs-reps",
        label: "Hubs & reps",
        description: "Per-hub roster, activity, and drill-down",
        area: "registration",
        hiddenFrom: ["finance"],
      },
      {
        href: "/admin/tours",
        label: "Tours",
        description: "Manage tour packages and orders",
        area: "registration",
        hiddenFrom: ["finance"],
      },
      {
        href: "/admin/hotels",
        label: "Hotels",
        description: "Preferred hotels near campus",
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
        description: "FAQs and announcements",
        area: "content",
      },
      {
        href: "/admin/hero",
        label: "Hero",
        description: "Homepage hero images and order",
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
      {
        href: "/admin/settings",
        label: "Settings",
        description: "Deadline, payment details, pricing, capacity, and operations",
        area: "settings",
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
