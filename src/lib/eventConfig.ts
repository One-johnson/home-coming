export const EVENT = {
  name: "Mountain of the Lord",
  subtitle: "The Homecoming",
  fullTitle: '"Mountain of the Lord" — The Homecoming',
  dates: "November 2–8, 2026",
  startDate: new Date("2026-11-02T08:00:00+00:00"),
  endDate: new Date("2026-11-08T23:59:59+00:00"),
  checkInDate: "2026-11-02",
  checkOutDate: "2026-11-08",
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
  { href: "/registration", label: "Registration" },
  { href: "/tours", label: "Tours" },
  { href: "/accommodation", label: "Accommodation" },
  { href: "/gallery", label: "Gallery" },
  { href: "/messages", label: "Messages" },
  { href: "/faqs", label: "FAQs" },
] as const;
