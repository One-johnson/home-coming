export type DefaultTourPackage = {
  slug: string;
  label: string;
  dateLabel: string;
  timeRange: string;
  sites: string[];
  meals: string;
  priceUsd: number;
  priceGhs: number;
  order: number;
  imageUrl: string;
  badge?: string;
};

/** Seeded defaults — editable in admin after insert. */
export const DEFAULT_TOUR_PACKAGES: DefaultTourPackage[] = [
  {
    slug: "accra_mon_nov_1",
    label: "Accra Tours",
    dateLabel: "Monday, November 1st",
    timeRange: "Full day",
    sites: [
      "First Love Center",
      "The Qodesh and St Kathryn's Hospital",
      "Korle Gonno Cathedral (the first cathedral)",
      "Korle Bu — Medical Canteen and School of Hygiene (where it all began)",
    ],
    meals: "Breakfast snack and lunch",
    priceUsd: 40,
    priceGhs: 600,
    order: 1,
    imageUrl: "/gallery/2025/homecoming-02.jpg",
    badge: "Accra",
  },
  {
    slug: "mountain_thu_nov_4",
    label: "Mountain Tours",
    dateLabel: "Thursday, November 4th",
    timeRange: "Full day",
    sites: [
      "St Adelaide's School — Aburi",
      "St Elizabeth's Home (Orphanage)",
      "St Gamaliel's Hospital and Prosthesis Center",
    ],
    meals: "Breakfast snack and lunch",
    priceUsd: 35,
    priceGhs: 525,
    order: 2,
    imageUrl: "/gallery/2025/homecoming-08.jpg",
    badge: "Mountain",
  },
];

/** Older seeded packages removed by sync. */
export const RETIRED_TOUR_PACKAGE_SLUGS = [
  "sat_oct_31",
  "sun_nov_1",
  "mon_nov_2",
  "tue_nov_3",
] as const;

export const TOUR_CURRENCY = "USD" as const;
export const FALLBACK_TOUR_IMAGE = "/campus/campus.jpg";

export function slugifyTourLabel(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return base || `tour_${Date.now()}`;
}
