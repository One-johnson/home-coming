export type DefaultTourPackage = {
  slug: string;
  label: string;
  dateLabel: string;
  timeRange: string;
  sites: string[];
  meals: string;
  priceUsd: number;
  order: number;
  imageUrl: string;
  badge?: string;
};

/** Seeded defaults — editable in admin after insert. */
export const DEFAULT_TOUR_PACKAGES: DefaultTourPackage[] = [
  {
    slug: "sat_oct_31",
    label: "Package 1",
    dateLabel: "Saturday, October 31st",
    timeRange: "8:00 AM – 6:00 PM",
    sites: [
      "St. Adelaide's School – Aburi",
      "St. Elizabeth's Home (Orphanage) – Aburi",
      "St. Gamaliel's Hospital & Prosthesis Center",
      "First Love Center",
      "The Qodesh & St. Kathyrn's Hospital",
      "Korle Gonno Cathedral",
      "Korle Bu – Medical School Canteen & School of Hygiene",
    ],
    meals: "Breakfast snack & Lunch",
    priceUsd: 40,
    order: 1,
    imageUrl: "/gallery/2025/homecoming-02.jpg",
    badge: "Full day",
  },
  {
    slug: "sun_nov_1",
    label: "Package 2",
    dateLabel: "Sunday, 1st November",
    timeRange: "1:00 PM – 6:00 PM",
    sites: [
      "St. Adelaide's School – Aburi",
      "St. Elizabeth's Home (Orphanage) – Aburi",
      "St. Gamaliel's Hospital & Prosthesis Center",
      "First Love Center",
    ],
    meals: "Lunch",
    priceUsd: 30,
    order: 2,
    imageUrl: "/gallery/2025/homecoming-08.jpg",
    badge: "Half day",
  },
  {
    slug: "mon_nov_2",
    label: "Package 3",
    dateLabel: "Monday, 2nd November",
    timeRange: "8:00 AM – 6:00 PM",
    sites: [
      "St. Adelaide's School – Aburi",
      "St. Elizabeth's Home (Orphanage) – Aburi",
      "St. Gamaliel's Hospital & Prosthesis Center",
      "First Love Center",
      "The Qodesh & St. Kathyrn's Hospital",
      "Korle Gonno Cathedral",
      "Korle Bu – Medical School Canteen & School of Hygiene",
    ],
    meals: "Breakfast snack & Lunch",
    priceUsd: 40,
    order: 3,
    imageUrl: "/campus/anagkazo.jpg",
    badge: "Full day",
  },
  {
    slug: "tue_nov_3",
    label: "Package 4",
    dateLabel: "Tuesday, 3rd November",
    timeRange: "8:00 AM – 4:00 PM",
    sites: [
      "St. Adelaide's School – Aburi",
      "St. Elizabeth's Home (Orphanage) – Aburi",
      "St. Gamaliel's Hospital & Prosthesis Center",
      "First Love Center",
      "The Qodesh & St. Kathyrn's Hospital",
    ],
    meals: "Breakfast snack & Lunch",
    priceUsd: 35,
    order: 4,
    imageUrl: "/gallery/2025/homecoming-15.jpg",
  },
];

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
