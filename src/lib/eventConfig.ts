/**
 * The gathering's formal name — the single brand string for the public site,
 * the representative portal and the staff console.
 */
export const CONFERENCE_NAME = "Attempt Great Things Conference";

/** Monogram for badges and compact surfaces (three letters fit a small tile). */
export const CONFERENCE_MONOGRAM = "AGC";

export const EVENT = {
  name: CONFERENCE_NAME,
  subtitle: "Conference 2026",
  fullTitle: CONFERENCE_NAME,
  dates: "November 3–6, 2026",
  startDate: new Date("2026-11-03T08:00:00+00:00"),
  endDate: new Date("2026-11-06T23:59:59+00:00"),
  checkInDate: "2026-11-03",
  checkOutDate: "2026-11-06",
  venue: "Anagkazo Campus",
  venueUrl: "https://anagkazo-campus.com/",
  location: "Mampong, Ghana",
  host: "Dag Heward-Mills",
  hostUrl: "https://daghewardmills.org",
  supportEmail: "homecomingisback@gmail.com",
  launchDate: "July 24, 2026",
  /** Most recent convention with photos and stats on the site */
  lastHomecomingYear: 2025,
} as const;

/** Public site feature switches — flip when a flow is ready to show. */
export const SITE_FEATURES = {
  /** Optional registration extras (VIP meals, etc.). Off for now. */
  addOnsEnabled: false,
} as const;

export const HOST_CTA_LINKS = [
  { href: "https://daghewardmills.org", label: "daghewardmills.org" },
  { href: "https://dagbooks.org", label: "dagbooks.org" },
  { href: "https://firstlovemusic.org", label: "firstlovemusic.org" },
  { href: "https://udnews.org", label: "udnews.org" },
  {
    href: "https://anagkazobibleministrytrainingcentre.org/",
    label: "Anagkazo Bible Ministry",
  },
  {
    href: "https://www.youtube.com/channel/UCmpJUHS40NNiHGCV_K7ya-A",
    label: "YouTube Channel",
  },
] as const;

export const NAV_LINKS: {
  href: string;
  label: string;
  external?: boolean;
}[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "https://daghewardmills.org", label: "Dag Heward-Mills", external: true },
  { href: "/tours", label: "Tours" },
  { href: "/gallery", label: "Gallery" },
  { href: "/messages", label: "Messages" },
  { href: "/faqs", label: "FAQs" },
];
