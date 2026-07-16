import type { Metadata } from "next";
import { EVENT } from "@/lib/eventConfig";

/** Canonical public site origin. Set NEXT_PUBLIC_SITE_URL in production. */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_NAME = `${EVENT.name} — ${EVENT.subtitle}`;

export const DEFAULT_DESCRIPTION = `Join ${EVENT.fullTitle}, ${EVENT.dates} at ${EVENT.venue}, ${EVENT.location}. Register for the Homecoming Convention with Dag Heward-Mills.`;

export const DEFAULT_OG_IMAGE = "/hero/banner.jpeg";

export const SEO_KEYWORDS = [
  "Homecoming Convention",
  "Mountain of the Lord",
  "Dag Heward-Mills",
  "Anagkazo Campus",
  "Mampong Ghana",
  "Christian conference Ghana",
  "Homecoming 2026",
  "church conference registration",
  "Anagkazo Bible Ministry",
] as const;

type PageSeoInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path = "/",
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
}: PageSeoInput): Metadata {
  const siteUrl = getSiteUrl();
  const url = `${siteUrl}${path === "/" ? "" : path}`;
  const isHome = path === "/";
  const ogTitle = isHome ? SITE_NAME : `${title} | ${EVENT.subtitle}`;

  return {
    title: isHome
      ? { absolute: SITE_NAME }
      : title,
    description,
    keywords: [...SEO_KEYWORDS],
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      locale: "en_GH",
      url,
      siteName: SITE_NAME,
      title: ogTitle,
      description,
      images: [
        {
          url: image.startsWith("http") ? image : `${siteUrl}${image}`,
          width: 1200,
          height: 630,
          alt: `${EVENT.fullTitle} — ${EVENT.venue}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [image.startsWith("http") ? image : `${siteUrl}${image}`],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        }
      : { index: true, follow: true },
  };
}

export const PAGE_SEO = {
  home: {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    path: "/",
    image: "/hero/banner.jpeg",
  },
  about: {
    title: "About The Homecoming",
    description: `Learn the history, purpose, and vision of ${EVENT.fullTitle} at ${EVENT.venue}, ${EVENT.location}.`,
    path: "/about",
    image: "/campus/anagkazo.jpg",
  },
  registration: {
    title: "Register for The Homecoming",
    description: `Register for ${EVENT.fullTitle}, ${EVENT.dates}. Individual and group tickets with Paystack and PayPal checkout.`,
    path: "/registration",
    image: "/hero/slide-01.jpg",
  },
  accommodation: {
    title: "Accommodation",
    description: `Book campus housing at ${EVENT.venue} or nearby hotels in ${EVENT.location} for ${EVENT.dates}.`,
    path: "/accommodation",
    image: "/campus/campus.jpg",
  },
  tours: {
    title: "Homecoming Tour Packages",
    description: `Book guided Homecoming tour packages for ${EVENT.fullTitle}. Choose packages by day and purchase tickets separately from registration.`,
    path: "/tours",
    image: "/campus/anagkazo.jpg",
  },
  gallery: {
    title: "Photo Gallery",
    description: `Photos from previous Homecoming conventions at ${EVENT.venue}, ${EVENT.location}.`,
    path: "/gallery",
    image: "/gallery/2025/homecoming-01.jpg",
  },
  messages: {
    title: "Messages & Videos",
    description: `Watch Homecoming messages and videos featuring ${EVENT.host} and convention speakers.`,
    path: "/messages",
    image: "/dag-main.jpg",
  },
  faqs: {
    title: "Frequently Asked Questions",
    description: `FAQs about registration, accommodation, travel, and attending ${EVENT.fullTitle} in ${EVENT.location}.`,
    path: "/faqs",
    image: "/hero/slide-02.jpg",
  },
} as const;

export function buildEventJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: EVENT.fullTitle,
    description: DEFAULT_DESCRIPTION,
    startDate: EVENT.startDate.toISOString(),
    endDate: EVENT.endDate.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: [`${siteUrl}${DEFAULT_OG_IMAGE}`],
    url: siteUrl,
    location: {
      "@type": "Place",
      name: EVENT.venue,
      url: EVENT.venueUrl,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Mampong",
        addressCountry: "GH",
      },
    },
    organizer: {
      "@type": "Person",
      name: EVENT.host,
      url: EVENT.hostUrl,
    },
    performer: {
      "@type": "Person",
      name: EVENT.host,
      url: EVENT.hostUrl,
    },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/registration`,
      availability: "https://schema.org/InStock",
      validFrom: new Date().toISOString().slice(0, 10),
    },
  };
}

export function buildOrganizationJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/dhmm.png`,
    email: EVENT.supportEmail,
    sameAs: [
      EVENT.hostUrl,
      "https://dagbooks.org",
      "https://www.youtube.com/channel/UCmpJUHS40NNiHGCV_K7ya-A",
    ],
  };
}

export function buildWebSiteJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
    description: DEFAULT_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: `${siteUrl}/dhmm.png`,
    },
  };
}
