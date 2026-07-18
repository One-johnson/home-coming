/** Shared admin console color tokens — charts, badges, KPI accents. */

export const ADMIN_CHART = {
  gold: "#b8860b",
  goldLight: "#d4af37",
  goldSoft: "#f0e6c8",
  forest: "#1b4332",
  forestLight: "#2d6a4f",
  forestSoft: "#d8eee4",
  sky: "#0284c7",
  skyLight: "#38bdf8",
  violet: "#7c3aed",
  violetLight: "#a78bfa",
  amber: "#d97706",
  amberLight: "#f59e0b",
  rose: "#e11d48",
  emerald: "#059669",
  stone: "#6b6358",
  stoneSoft: "#e8e0d4",
  ink: "#0a0a0a",
  grid: "#e8e0d4",
} as const;

export const ADMIN_STATUS_CHART: Record<string, string> = {
  Paid: ADMIN_CHART.emerald,
  Pending: ADMIN_CHART.amber,
  Failed: ADMIN_CHART.rose,
  "Mock paid": ADMIN_CHART.goldLight,
  Stub: ADMIN_CHART.stone,
  Sent: ADMIN_CHART.sky,
};

export const ADMIN_PIE_PALETTE = [
  ADMIN_CHART.gold,
  ADMIN_CHART.forest,
  ADMIN_CHART.sky,
  ADMIN_CHART.violet,
  ADMIN_CHART.amber,
  ADMIN_CHART.emerald,
  ADMIN_CHART.rose,
  ADMIN_CHART.goldLight,
] as const;

export function paymentStatusBadgeClass(status: string) {
  switch (status) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "mock_paid":
      return "border-gold/40 bg-gold/10 text-gold-dark";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "pending_payment":
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
}

export function emailStatusBadgeClass(status: string) {
  switch (status) {
    case "sent":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "stub":
    default:
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
}

export function mediaTypeBadgeClass(mediaType: string) {
  switch (mediaType) {
    case "video":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "audio":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "message":
    default:
      return "border-forest/20 bg-forest/5 text-forest";
  }
}

export function auditActionBadgeClass(action: string) {
  if (action.includes("delete") || action.includes("failed")) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (action.includes("create") || action.includes("bulk_created")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (action.includes("payment") || action.includes("update")) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (action.includes("email")) {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  return "border-gold/30 bg-gold/10 text-gold-dark";
}

export function housingCapacityTone(remaining: number, capacity: number) {
  if (capacity <= 0) return "ok" as const;
  const ratio = remaining / capacity;
  if (remaining <= 0) return "full" as const;
  if (ratio <= 0.15 || remaining <= 5) return "low" as const;
  if (ratio <= 0.4) return "mid" as const;
  return "ok" as const;
}

export const HOUSING_TONE_CLASS = {
  full: "border-rose-200 bg-rose-50/70",
  low: "border-amber-200 bg-amber-50/70",
  mid: "border-sky-200 bg-sky-50/50",
  ok: "border-emerald-200 bg-emerald-50/40",
} as const;

export const KPI_ACCENTS = {
  registrations: {
    icon: "bg-emerald-100 text-emerald-700",
    border: "group-hover:border-emerald-300",
    tint: "from-emerald-50/80 to-white",
  },
  bookings: {
    icon: "bg-amber-100 text-amber-800",
    border: "group-hover:border-amber-300",
    tint: "from-amber-50/80 to-white",
  },
  videos: {
    icon: "bg-violet-100 text-violet-700",
    border: "group-hover:border-violet-300",
    tint: "from-violet-50/80 to-white",
  },
  emails: {
    icon: "bg-sky-100 text-sky-700",
    border: "group-hover:border-sky-300",
    tint: "from-sky-50/80 to-white",
  },
} as const;
