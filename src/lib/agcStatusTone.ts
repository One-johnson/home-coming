/**
 * One colour vocabulary for every arrival-day surface — desk, runbook, ops
 * reports, desk check-in and the pre-arrival checklist.
 *
 * The rule staff learn once:
 *   emerald = done, nothing to do      amber  = blocked, needs a human
 *   rose    = refused / needs review   slate  = waiting or inert
 *   sky     = information              neutral = plain, no state
 *
 * Colour is never the only signal: every tinted state also carries an icon or
 * a word, because the desks run on venue monitors and in bright rooms where
 * colour alone is unreliable.
 */

export type StatusTone =
  | "done"
  | "blocked"
  | "refused"
  | "waiting"
  | "info"
  | "neutral";

/** Outline badge (text + border + tinted background). */
export const TONE_BADGE: Record<StatusTone, string> = {
  done: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  blocked:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  refused:
    "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  waiting:
    "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  info: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  neutral: "border-border text-muted-foreground",
};

/** Whole-card surface for stat tiles and callouts. */
export const TONE_SURFACE: Record<StatusTone, string> = {
  done: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30",
  blocked:
    "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/30",
  refused:
    "border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30",
  waiting: "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40",
  info: "border-sky-200 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/30",
  neutral: "border-border bg-card",
};

/** Text-only accent (numbers, headings, inline emphasis). */
export const TONE_TEXT: Record<StatusTone, string> = {
  done: "text-emerald-700 dark:text-emerald-400",
  blocked: "text-amber-800 dark:text-amber-400",
  refused: "text-rose-700 dark:text-rose-400",
  waiting: "text-slate-600 dark:text-slate-400",
  info: "text-sky-800 dark:text-sky-400",
  neutral: "text-muted-foreground",
};

/** Left accent rail for table rows and list items (pair with `border-l-4`). */
export const TONE_RAIL: Record<StatusTone, string> = {
  done: "border-l-emerald-500",
  blocked: "border-l-amber-500",
  refused: "border-l-rose-500",
  waiting: "border-l-slate-300 dark:border-l-slate-700",
  info: "border-l-sky-500",
  neutral: "border-l-transparent",
};

/** Small filled dot for legends and inline markers. */
export const TONE_DOT: Record<StatusTone, string> = {
  done: "bg-emerald-500",
  blocked: "bg-amber-500",
  refused: "bg-rose-500",
  waiting: "bg-slate-400",
  info: "bg-sky-500",
  neutral: "bg-muted-foreground/40",
};

/** Row background wash, kept light enough to read black text on. */
export const TONE_ROW: Record<StatusTone, string> = {
  done: "bg-emerald-50/60 dark:bg-emerald-950/20",
  blocked: "bg-amber-50/50 dark:bg-amber-950/20",
  refused: "bg-rose-50/60 dark:bg-rose-950/20",
  waiting: "bg-transparent",
  info: "bg-sky-50/50 dark:bg-sky-950/20",
  neutral: "bg-transparent",
};

/** Occupancy bars: green room to spare, amber nearly full, rose full. */
export function occupancyTone(percent: number): StatusTone {
  if (percent >= 95) return "refused";
  if (percent >= 70) return "blocked";
  return "done";
}

export const TONE_BAR: Record<StatusTone, string> = {
  done: "bg-emerald-500",
  blocked: "bg-amber-500",
  refused: "bg-rose-500",
  waiting: "bg-slate-400",
  info: "bg-sky-500",
  neutral: "bg-primary",
};

/**
 * Payment state as the desk reads it: one label, one tone. Raw enum values
 * never reach a volunteer's screen.
 */
export function paymentState(
  paymentStatus: string | null | undefined,
  poaStatus: string | null | undefined,
): { label: string; tone: StatusTone; detail?: string } {
  if (poaStatus === "confirmed") return { label: "POA paid", tone: "done" };
  if (paymentStatus === "confirmed") return { label: "Paid", tone: "done" };
  if (poaStatus === "evidence_submitted") {
    return {
      label: "POA evidence — review",
      tone: "info",
      detail: "Proof uploaded; confirm it before check-in.",
    };
  }
  if (poaStatus === "pending" || poaStatus === "poa_pending") {
    return {
      label: "POA pending",
      tone: "blocked",
      detail: "Pay on arrival — collect at the desk or override with a reason.",
    };
  }
  if (paymentStatus === "not_required") {
    return { label: "No payment due", tone: "waiting" };
  }
  const human = (paymentStatus ?? "").replace(/_/g, " ").trim();
  return {
    label: human ? `Payment ${human}` : "Payment unconfirmed",
    tone: "blocked",
  };
}

/** Check-in state as staff read it, with the route's tone. */
export function checkInState(status: string): {
  label: string;
  tone: StatusTone;
} {
  if (status === "checked_in") return { label: "Checked in", tone: "done" };
  if (status === "checked_out") return { label: "Checked out", tone: "waiting" };
  return { label: "Not arrived", tone: "waiting" };
}

export type DeskRowState = {
  /** The tone of the row's left rail — the action it needs next. */
  tone: StatusTone;
  /** Short "what to do now" label for the status column. */
  label: string;
  /** Whether the row can be checked in from the desk right now. */
  ready: boolean;
};

/**
 * The next action for one search row:
 *   emerald = ready to check in, amber = blocked, sky = already in,
 *   slate = checked out or inert.
 */
export function deskRowState(row: {
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
  assignmentStatus: "assigned" | "unassigned";
  paymentStatus: string;
  poaStatus: string | null;
}): DeskRowState {
  if (row.checkInStatus === "checked_in") {
    return { tone: "info", label: "Checked in", ready: false };
  }
  if (row.checkInStatus === "checked_out") {
    return { tone: "waiting", label: "Checked out", ready: false };
  }
  if (row.assignmentStatus !== "assigned") {
    return { tone: "blocked", label: "No room — refer", ready: false };
  }
  const paid =
    row.paymentStatus === "confirmed" || row.poaStatus === "confirmed";
  if (!paid) return { tone: "blocked", label: "Payment first", ready: false };
  return { tone: "done", label: "Ready — check in", ready: true };
}

/**
 * Per-building chips so Blocks 1–8 are recognisable rather than read. The
 * colour is a stable hash of the building name, not a data attribute.
 */
const BUILDING_CHIPS = [
  "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
  "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
  "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300",
  "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300",
  "border-lime-300 bg-lime-50 text-lime-800 dark:border-lime-800 dark:bg-lime-950/60 dark:text-lime-300",
] as const;

export function buildingChipIndex(building: string): number {
  let hash = 0;
  for (let i = 0; i < building.length; i += 1) {
    hash = (hash * 31 + building.charCodeAt(i)) % 9973;
  }
  return hash % BUILDING_CHIPS.length;
}

export function buildingChipClass(building: string | null | undefined): string {
  if (!building) return "";
  return BUILDING_CHIPS[buildingChipIndex(building)];
}

/** The legend the desk and runbook both show, so the colours are documented. */
export const TONE_LEGEND: Array<{ tone: StatusTone; label: string; hint: string }> = [
  { tone: "done", label: "Done", hint: "checked in, paid, key returned" },
  { tone: "blocked", label: "Blocked", hint: "no room, payment, key out" },
  { tone: "refused", label: "Review", hint: "conflicts, overrides, refusals" },
  { tone: "waiting", label: "Waiting", hint: "not arrived, checked out" },
  { tone: "info", label: "Info", hint: "already in, block / hub" },
];
