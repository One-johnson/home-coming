/**
 * View helpers for the rep registration portal. Pure functions so the
 * status-timeline rules can be unit-tested without the React tree.
 */

export type RegistrationStage = {
  /** Index of the furthest step reached (0 = submitted, 1 = review, 2 = done). */
  current: 0 | 1 | 2;
  /** A rejected receipt means finance said no — review step turns rose. */
  rejected: boolean;
  steps: [string, string, string];
};

const STEPS: [string, string, string] = ["Submitted", "Under review", "Confirmed"];

export function registrationStage(paymentStatus: string): RegistrationStage {
  if (paymentStatus === "confirmed") {
    return { current: 2, rejected: false, steps: STEPS };
  }
  if (paymentStatus === "pending_verification" || paymentStatus === "correction_requested") {
    return { current: 1, rejected: false, steps: STEPS };
  }
  if (paymentStatus === "rejected") {
    return { current: 1, rejected: true, steps: STEPS };
  }
  // awaiting_payment and anything unknown: waiting on the rep, not finance.
  return { current: 0, rejected: false, steps: STEPS };
}

/** Filter groups for the purchase-history chips, with their predicates. */
export const REGISTRATION_FILTERS = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Awaiting payment" },
  { id: "review", label: "Under review" },
  { id: "confirmed", label: "Confirmed" },
  { id: "rejected", label: "Rejected" },
] as const;

export type RegistrationFilterId = (typeof REGISTRATION_FILTERS)[number]["id"];

export function matchesRegistrationFilter(
  filter: RegistrationFilterId,
  paymentStatus: string,
): boolean {
  switch (filter) {
    case "awaiting":
      return paymentStatus === "awaiting_payment";
    case "review":
      return paymentStatus === "pending_verification" || paymentStatus === "correction_requested";
    case "confirmed":
      return paymentStatus === "confirmed";
    case "rejected":
      return paymentStatus === "rejected";
    default:
      return true;
  }
}

/** Delegate-count quick-pick chips shown under the quantity stepper. */
export const REGISTRATION_QUICK_PICKS = [1, 5, 10, 25] as const;