/**
 * Preferred hotels from hotels/Homecoming_Hotels.pdf
 * Price is GHS per room (double) unless noted for dorm beds.
 */
export type HotelSeed = {
  name: string;
  location: string;
  rooms: number;
  roomType: string;
  doubleSpaces: number;
  singleSpaces: number;
  totalSpaces: number;
  priceGhs: number;
  dormitories?: number;
  dormCostGhs?: number;
  order: number;
};

export const HOTELS: HotelSeed[] = [
  {
    name: "Bendu Village",
    location: "Berekusu",
    rooms: 3,
    roomType: "Double",
    doubleSpaces: 6,
    singleSpaces: 0,
    totalSpaces: 6,
    priceGhs: 700,
    order: 1,
  },
  {
    name: "Hephizibah",
    location: "Peduase",
    rooms: 70,
    roomType: "Double",
    doubleSpaces: 140,
    singleSpaces: 10,
    totalSpaces: 150,
    priceGhs: 1000,
    order: 2,
  },
  {
    name: "Hill Palace",
    location: "Peduase",
    rooms: 43,
    roomType: "Double",
    doubleSpaces: 86,
    singleSpaces: 0,
    totalSpaces: 86,
    priceGhs: 800,
    order: 3,
  },
  {
    name: "Springfield Lodge",
    location: "Peduase",
    rooms: 11,
    roomType: "Double",
    doubleSpaces: 22,
    singleSpaces: 0,
    totalSpaces: 22,
    priceGhs: 1400,
    order: 4,
  },
  {
    name: "Ashgrove",
    location: "Kitase",
    rooms: 12,
    roomType: "Double",
    doubleSpaces: 24,
    singleSpaces: 0,
    totalSpaces: 24,
    priceGhs: 600,
    order: 5,
  },
  {
    name: "Aruba",
    location: "Aburi",
    rooms: 40,
    roomType: "Double",
    doubleSpaces: 80,
    singleSpaces: 0,
    totalSpaces: 80,
    priceGhs: 850,
    order: 6,
  },
  {
    name: "Hill Burri",
    location: "Aburi",
    rooms: 12,
    roomType: "Double",
    doubleSpaces: 24,
    singleSpaces: 0,
    totalSpaces: 24,
    priceGhs: 1800,
    order: 7,
  },
  {
    name: "Little Acre",
    location: "Aburi",
    rooms: 25,
    roomType: "Double",
    doubleSpaces: 50,
    singleSpaces: 0,
    totalSpaces: 50,
    priceGhs: 1000,
    order: 8,
  },
  {
    name: "Beposa",
    location: "Aburi",
    rooms: 5,
    roomType: "Double",
    doubleSpaces: 10,
    singleSpaces: 0,
    totalSpaces: 10,
    priceGhs: 4000,
    order: 9,
  },
  {
    name: "Cactus Creek",
    location: "Aburi",
    rooms: 20,
    roomType: "Double",
    doubleSpaces: 40,
    singleSpaces: 0,
    totalSpaces: 40,
    priceGhs: 2000,
    order: 10,
  },
  {
    name: "EL King Home Lodge",
    location: "Aburi",
    rooms: 13,
    roomType: "Double",
    doubleSpaces: 26,
    singleSpaces: 0,
    totalSpaces: 26,
    priceGhs: 800,
    order: 11,
  },
  {
    name: "De-Ofosu Plaza Hotel",
    location: "Ahwerase",
    rooms: 17,
    roomType: "Double",
    doubleSpaces: 34,
    singleSpaces: 0,
    totalSpaces: 34,
    priceGhs: 1000,
    order: 12,
  },
  {
    name: "Mount Pleasant",
    location: "Ahwerase",
    rooms: 8,
    roomType: "Double",
    doubleSpaces: 16,
    singleSpaces: 5,
    totalSpaces: 21,
    priceGhs: 1200,
    order: 13,
  },
  {
    name: "Holy Land",
    location: "Obosomaase",
    rooms: 10,
    roomType: "Double",
    doubleSpaces: 34,
    singleSpaces: 64,
    totalSpaces: 98,
    priceGhs: 1500,
    dormitories: 100,
    dormCostGhs: 500,
    order: 14,
  },
  {
    name: "Bribong",
    location: "Obosomaase",
    rooms: 8,
    roomType: "Double",
    doubleSpaces: 16,
    singleSpaces: 0,
    totalSpaces: 16,
    priceGhs: 1500,
    order: 15,
  },
  {
    name: "Royal Lees",
    location: "Mampong",
    rooms: 114,
    roomType: "Double",
    doubleSpaces: 228,
    singleSpaces: 0,
    totalSpaces: 228,
    priceGhs: 800,
    order: 16,
  },
  {
    name: "Higher Heights Hotel",
    location: "Akropong",
    rooms: 31,
    roomType: "Double",
    doubleSpaces: 62,
    singleSpaces: 0,
    totalSpaces: 62,
    priceGhs: 500,
    order: 17,
  },
  {
    name: "Kwayisibea",
    location: "Akropong",
    rooms: 29,
    roomType: "Double",
    doubleSpaces: 58,
    singleSpaces: 0,
    totalSpaces: 58,
    priceGhs: 1400,
    order: 18,
  },
  {
    name: "Herty Home",
    location: "Akropong",
    rooms: 21,
    roomType: "Double",
    doubleSpaces: 42,
    singleSpaces: 0,
    totalSpaces: 42,
    priceGhs: 500,
    order: 19,
  },
  {
    name: "Akuapim Hospitality Centre",
    location: "Akropong",
    rooms: 39,
    roomType: "Double",
    doubleSpaces: 78,
    singleSpaces: 0,
    totalSpaces: 78,
    priceGhs: 300,
    order: 20,
  },
  {
    name: "Lord and Larry",
    location: "Adukroam",
    rooms: 20,
    roomType: "Double",
    doubleSpaces: 40,
    singleSpaces: 0,
    totalSpaces: 40,
    priceGhs: 500,
    order: 21,
  },
  {
    name: "Ridge Nest",
    location: "Adukroam",
    rooms: 13,
    roomType: "Double",
    doubleSpaces: 26,
    singleSpaces: 1,
    totalSpaces: 27,
    priceGhs: 1000,
    order: 22,
  },
];

function formatGhs(amount: number) {
  return `GHS ${amount.toLocaleString("en-GH")}`;
}

function occupancyLine(hotel: HotelSeed) {
  const parts = [
    `${hotel.rooms} ${hotel.roomType.toLowerCase()} room${hotel.rooms === 1 ? "" : "s"}`,
  ];

  if (hotel.doubleSpaces > 0) {
    parts.push(`${hotel.doubleSpaces} double spaces`);
  }
  if (hotel.singleSpaces > 0) {
    parts.push(`${hotel.singleSpaces} single spaces`);
  }
  parts.push(`${hotel.totalSpaces} bed spaces total`);

  if (hotel.dormitories && hotel.dormitories > 0) {
    const dormCost =
      hotel.dormCostGhs !== undefined
        ? ` at ${formatGhs(hotel.dormCostGhs)} each`
        : "";
    parts.push(`${hotel.dormitories} dorm beds${dormCost}`);
  }

  return parts.join(" · ");
}

/** Fields stored on the Convex `hotels` table */
export function hotelDocumentFields(hotel: HotelSeed) {
  return {
    name: hotel.name,
    contact: "Book via your denomination / hub coordinator",
    rate: `${formatGhs(hotel.priceGhs)} per room`,
    distance: hotel.location,
    instructions: occupancyLine(hotel),
    order: hotel.order,
  };
}
