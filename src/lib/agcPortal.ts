export type AgcRegion =
  | "ghana"
  | "west_africa"
  | "rest_of_africa"
  | "north_america"
  | "england"
  | "switzerland"
  | "rest_of_europe"
  | "rest_of_world";

export type AgcAccommodationType =
  | "dormitory"
  | "hostel"
  | "wise_serpents"
  | "good_general"
  | "ebpv";

export const AGC_REGION_LABELS: Record<AgcRegion, string> = {
  ghana: "Ghana",
  west_africa: "West Africa (outside Ghana)",
  rest_of_africa: "Rest of Africa",
  north_america: "North America",
  england: "England",
  switzerland: "Switzerland",
  rest_of_europe: "Rest of Europe",
  rest_of_world: "Rest of World",
};

/** GHS hubs pay offline via bank transfer / MoMo (SRS §11). */
export function isGhsRegion(region: string): boolean {
  return region === "ghana" || region === "west_africa";
}

export const AGC_ACCOMMODATION_LABELS: Record<AgcAccommodationType, string> = {
  dormitory: "Dormitory (Mighty Fortress)",
  hostel: "Hostel (Blocks 1–8)",
  wise_serpents: "Wise as Serpents Lodge",
  good_general: "Good General Lodge",
  ebpv: "EBPV Apartment",
};

export function paymentStatusMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      };
    case "pending_verification":
      return {
        label: "Under review",
        className:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
    case "correction_requested":
      return {
        label: "Correction requested",
        className:
          "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    default:
      return {
        label: "Awaiting payment",
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

export function bookingStatusMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      };
    case "reserved":
      return {
        label: "Reserved (hold)",
        className:
          "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
      };
    case "pending_verification":
      return {
        label: "Under review",
        className:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
    case "correction_requested":
      return {
        label: "Correction requested",
        className:
          "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
      };
    case "expired":
      return {
        label: "Expired",
        className: "border-border bg-muted text-muted-foreground",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "border-border bg-muted text-muted-foreground",
      };
    default:
      return {
        label: status,
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}
