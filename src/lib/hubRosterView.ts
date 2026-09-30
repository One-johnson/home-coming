
/**
 * View helpers for the admin Hubs & Representatives page. Pure functions
 * so filter/sort/avatar rules are unit-testable without the React tree.
 */

export type HubRosterRow = {
  _id: string;
  hubName: string;
  region: string;
  active: boolean;
  rep: {
    _id: string;
    username: string;
    email: string | null;
    status: string;
    profileComplete: boolean;
  } | null;
  registrations: {
    total: number;
    confirmed: number;
    pending: number;
    delegates: number;
    lastActivityAt: number;
  };
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    lastActivityAt: number;
  };
  needsAttention: boolean;
  inactiveDays: number;
};

/** Stable two-letter initials for a hub avatar chip. */
export function hubInitials(hubName: string): string {
  const words = hubName.trim().split(" ").map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const AVATAR_CLASSES = [
  "bg-gold/20 text-gold-dark",
  "bg-forest/10 text-forest",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
] as const;

/** Deterministic avatar tint per hub (stable across renders). */
export function hubAvatarClass(hubName: string): string {
  const seed = hubName.toLowerCase().split("").reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997,
    7,
  );
  return AVATAR_CLASSES[seed % AVATAR_CLASSES.length];
}

/** Traffic-light for rep inactivity: fresh / cooling / gone-quiet. */
export function quietTone(
  inactiveDays: number,
  hasActivity: boolean,
): "fresh" | "cooling" | "quiet" | "none" {
  if (!hasActivity) return "none";
  if (inactiveDays === 0) return "fresh";
  if (inactiveDays <= 3) return "cooling";
  return "quiet";
}

export const QUIET_TONE_CLASS = {
  fresh: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  cooling: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  quiet: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  none: "border-border bg-muted text-muted-foreground",
} as const;

export function quietLabel(inactiveDays: number, hasActivity: boolean): string {
  if (!hasActivity) return "No activity";
  if (inactiveDays === 0) return "Active today";
  if (inactiveDays === 1) return "1 day";
  return inactiveDays + " days";
}

/** Filter chips for the roster toolbar. */
export const HUB_FILTERS = [
  { id: "all", label: "All" },
  { id: "attention", label: "Needs attention" },
  { id: "pending_setup", label: "Pending setup" },
  { id: "active", label: "Active reps" },
  { id: "disabled", label: "Disabled" },
  { id: "no_rep", label: "No rep" },
] as const;

export type HubFilterId = (typeof HUB_FILTERS)[number]["id"];

export function matchesHubFilter(
  filter: HubFilterId,
  hub: Pick<HubRosterRow, "rep" | "needsAttention" | "active">,
): boolean {
  switch (filter) {
    case "attention":
      return hub.needsAttention;
    case "pending_setup":
      return hub.rep?.status === "pending_setup";
    case "active":
      return hub.rep?.status === "active";
    case "disabled":
      return hub.rep?.status === "disabled";
    case "no_rep":
      return hub.rep === null;
    default:
      return true;
  }
}

export const HUB_SORTS = [
  { id: "name", label: "Hub name" },
  { id: "delegates", label: "Most delegates" },
  { id: "quiet", label: "Longest quiet" },
] as const;

export type HubSortId = (typeof HUB_SORTS)[number]["id"];

export function sortHubRows(
  sort: HubSortId,
  rows: HubRosterRow[],
): HubRosterRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "delegates":
      sorted.sort(
        (a, b) =>
          b.registrations.delegates - a.registrations.delegates ||
          a.hubName.localeCompare(b.hubName),
      );
      break;
    case "quiet":
      // Hubs with zero activity sort as if quiet forever.
      sorted.sort((a, b) => {
        const qa = a.inactiveDays + (lastActivity(a) === 0 ? 999 : 0);
        const qb = b.inactiveDays + (lastActivity(b) === 0 ? 999 : 0);
        return qb - qa || a.hubName.localeCompare(b.hubName);
      });
      break;
    default:
      sorted.sort((a, b) => a.hubName.localeCompare(b.hubName));
  }
  return sorted;
}

function lastActivity(hub: HubRosterRow): number {
  return Math.max(
    hub.registrations.lastActivityAt ?? 0,
    hub.bookings.lastActivityAt ?? 0,
  );
}

export function hubMatchesSearch(hub: HubRosterRow, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return (
    hub.hubName.toLowerCase().includes(q) ||
    (hub.rep?.username ?? "").toLowerCase().includes(q) ||
    (hub.rep?.email ?? "").toLowerCase().includes(q)
  );
}

/** Totals for the summary tile row. */
export function hubRosterSummary(rows: HubRosterRow[]) {
  return {
    hubs: rows.length,
    activeReps: rows.filter((r) => r.rep?.status === "active").length,
    pendingSetup: rows.filter((r) => r.rep?.status === "pending_setup").length,
    delegates: rows.reduce((sum, r) => sum + r.registrations.delegates, 0),
    confirmedDelegates: rows.reduce((sum, r) => sum + r.registrations.confirmed, 0),
    attention: rows.filter((r) => r.needsAttention).length,
  };
}