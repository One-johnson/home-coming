import { getBannerUrl } from "../_components/banner";
import type { AccommodationEmailProps } from "../accommodation-confirmation";
import type { RegistrationEmailProps } from "../registration-confirmation";
import type { TourEmailProps } from "../tour-confirmation";

export const previewRegistrationProps: RegistrationEmailProps = {
  bannerUrl: getBannerUrl(),
  recipientName: "Jane Doe",
  referenceNumber: "HC42187",
  ticketQuantity: 2,
  addOnLines: ["VIP Meals × 1", "Ministers Grill × 2"],
  totalAmount: "GHS 80.00",
  accommodationInterest: true,
};

export const previewAccommodationProps: AccommodationEmailProps = {
  bannerUrl: getBannerUrl(),
  guestName: "Jane Doe",
  housingLabel: "Condo",
  referenceNumber: "STAY-1042",
  checkIn: "2026-11-02",
  checkOut: "2026-11-08",
  guests: 2,
  totalAmount: "USD 10.00",
};

export const previewTourProps: TourEmailProps = {
  bannerUrl: getBannerUrl(),
  fullName: "Jane Doe",
  referenceNumber: "TOUR-3301",
  itemLines: [
    "Accra City Tour: Nov 3 × 2 (USD 40.00)",
    "Cape Coast Castle: Nov 5 × 1 (USD 25.00)",
  ],
  totalAmount: "USD 65.00",
};
