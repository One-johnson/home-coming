"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  CircleCheck,
  ClipboardList,
  KeyRound,
  ListChecks,
  Printer,
  Search,
  ShieldAlert,
  Users,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/app-button";
import { cn } from "@/lib/utils";

/**
 * The arrival-day runbook (RUNBOOK-NOV2.md at the repo root), embedded in the
 * console so venue staff can open it from a station on November 2 even if the
 * repo is not at hand. Searchable, colour-coded by phase, and linked straight
 * to the screen each section talks about.
 */

type Icon = ComponentType<{ className?: string }>;

/** The three voices a runbook step can speak in. */
type StepKind = "do" | "never" | "if-fails";

type Step = {
  heading?: string;
  text: string;
  kind?: StepKind;
};

type Accent = {
  rail: string;
  chip: string;
  icon: string;
  surface: string;
};

const ACCENTS: Record<string, Accent> = {
  violet: {
    rail: "border-l-violet-500",
    chip: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
    icon: "text-violet-700 dark:text-violet-400",
    surface: "bg-violet-50/60 dark:bg-violet-950/20",
  },
  sky: {
    rail: "border-l-sky-500",
    chip: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
    icon: "text-sky-700 dark:text-sky-400",
    surface: "bg-sky-50/60 dark:bg-sky-950/20",
  },
  emerald: {
    rail: "border-l-emerald-500",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    icon: "text-emerald-700 dark:text-emerald-400",
    surface: "bg-emerald-50/60 dark:bg-emerald-950/20",
  },
  amber: {
    rail: "border-l-amber-500",
    chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    icon: "text-amber-800 dark:text-amber-400",
    surface: "bg-amber-50/60 dark:bg-amber-950/20",
  },
  orange: {
    rail: "border-l-orange-500",
    chip: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
    icon: "text-orange-700 dark:text-orange-400",
    surface: "bg-orange-50/60 dark:bg-orange-950/20",
  },
  indigo: {
    rail: "border-l-indigo-500",
    chip: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
    icon: "text-indigo-700 dark:text-indigo-400",
    surface: "bg-indigo-50/60 dark:bg-indigo-950/20",
  },
};

const STEP_STYLES: Record<
  StepKind,
  { icon: Icon; label: string; box: string; text: string }
> = {
  do: {
    icon: CircleCheck,
    label: "Do",
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30",
    text: "text-emerald-800 dark:text-emerald-300",
  },
  never: {
    icon: ShieldAlert,
    label: "Never",
    box: "border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30",
    text: "text-rose-800 dark:text-rose-300",
  },
  "if-fails": {
    icon: AlertTriangle,
    label: "If it fails",
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/30",
    text: "text-amber-800 dark:text-amber-300",
  },
};

type RunbookSection = {
  id: string;
  title: string;
  short: string;
  icon: Icon;
  accent: Accent;
  steps: Step[];
  links?: { href: string; label: string }[];
};

const SECTIONS: RunbookSection[] = [
  {
    id: "who",
    title: "Who can do what",
    short: "Who",
    icon: Users,
    accent: ACCENTS.violet,
    steps: [
      {
        text: "Admin — everything, including payment overrides, corrections, and the Team page.",
      },
      {
        text: "Accommodation — rooms, import, publishing, overrides, corrections, reports.",
      },
      {
        text: "Room assignment staff — sign in at /room-assignment: rooms/assignments/changes plus check-in/out and keys.",
      },
      {
        text: "Check-in staff — sign in at /check-in: search, check-in/out, keys, status views only.",
      },
      {
        text: "Finance — registrations/POA verification, cash-collection desk, audit log.",
      },
      {
        text: "Every team has its own sign-in URL: /admin (admins), /registration, /accommodation, /finance, /content, /room-assignment and /check-in. A team URL only accepts that team's accounts; the venue staff doors both open the arrival desk.",
      },
      {
        text: "Every action carries your own account identity — it shows in the audit log and reports.",
      },
    ],
    links: [{ href: "/admin/team", label: "Team & logins" }],
  },
  {
    id: "import",
    title: "1. Import the physical room inventory (before arrival)",
    short: "1 · Import",
    icon: BedDouble,
    accent: ACCENTS.sky,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Accommodation → Rooms tab → Steps 7–12. Download the template or upload your own workbook: one sheet per accommodation type, a title row, then a header row (NO. OF ROOMS, ROOM NUMBER / Apartment name, CAPACITY) with one room per row underneath.",
      },
      {
        text: "Dormitory/hostel: one row per room, or one row with the bed total for unnumbered halls (Mighty Fortress). EBPV: one row per apartment, capacity 4. No gender column — staff assign delegates and check them in manually.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "An import may never exceed a pool — fix the sheet or the pool first. The preview compares the imported total per type against the confirmed inventory pools and lists bad rows by number.",
      },
      {
        text: "Commit: same-named rows update in place, others are created. Matching ignores case and spacing, so re-importing never duplicates a room — repeated rows in the sheet are ignored (first wins) and leftover duplicates are removed, unless someone is still roomed in one. EBPV rows over 4 delegates are rejected.",
      },
      {
        text: "Publish from the Publish… menu: all rooms at once, every room of one type, or one block as it becomes ready. Reps see only published rooms and only their own delegates.",
      },
    ],
    links: [
      { href: "/admin/accommodation", label: "Open Rooms tab" },
      { href: "/admin/pre-arrival", label: "Pre-arrival checklist" },
    ],
  },
  {
    id: "checkin",
    title: "2. Desk check-in (Arrival screen)",
    short: "2 · Desk",
    icon: ListChecks,
    accent: ACCENTS.emerald,
    steps: [
      {
        text: "Pick your desk location (a building, or Central), then search by name or hub (2+ characters). “/” focuses the search and Enter checks in a single ready match.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "Duplicate attempts are refused loudly: ALREADY CHECKED IN — room · time. Do not try a second device; the first check-in stands.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "Unassigned delegates: show the referral prompt — send them to Room-Assignment Staff or the Accommodation Admin. Check-in staff cannot assign rooms.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Payment not confirmed: only Admin/Accommodation may check the delegate in with a written override reason. The reason is stored and reported — check-in staff cannot do this.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Group check-in: pick the hub or arrival group, tick ONLY the delegates who physically arrived, then “Check in N arrived”. The rest of the group stays Not Arrived — nothing is auto-checked-in.",
      },
      {
        text: "Check-out is optional and never releases paid inventory. Dorms/hostels: wristband, not tracked. Key rooms: record Key returned / not returned.",
      },
    ],
    links: [
      { href: "/admin/arrival", label: "Open arrival desk" },
      { href: "/check-in", label: "Check-in staff sign-in" },
    ],
  },
  {
    id: "keys",
    title: "3. Keys (Wise as Serpents / Good General / EBPV)",
    short: "3 · Keys",
    icon: KeyRound,
    accent: ACCENTS.amber,
    steps: [
      {
        text: "Keys are tracked only for Wise as Serpents, Good General, and EBPV apartments. Dorms/hostels get wristbands — nothing is recorded.",
      },
      {
        text: "First arrival in a lodge room / EBPV apartment takes the key: the check-in dialog asks for the key recipient (defaults to the delegate).",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "If keys are already out, the desk is told who holds them — direct later arrivals to that person to coordinate access.",
      },
      {
        text: "Arrival → Keys panel: Replace (new key holder) and Returned per room. The full ledger is in the key reports.",
      },
    ],
    links: [{ href: "/admin/arrival", label: "Open the Keys panel" }],
  },
  {
    id: "offline",
    title: "4. Offline stations (dead zones)",
    short: "4 · Offline",
    icon: WifiOff,
    accent: ACCENTS.orange,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Designate ONE device per building: on that computer, open Arrival, pick the building as the location, then Admin (or the first staff member) clicks “Designate this device”.",
      },
      {
        text: "If connectivity drops, the station queues actions locally; on reconnect click “Sync now”. Queued transactions are idempotent by transaction id.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Conflicts (e.g. the delegate was checked in centrally while the station was offline) are never applied silently — resolve them in “Offline sync exceptions” (Admin/Accommodation). Keep it at zero before end of day.",
      },
    ],
    links: [{ href: "/admin/arrival", label: "Open offline station panel" }],
  },
  {
    id: "reports",
    title: "5. End-of-day reports (Ops reports screen)",
    short: "5 · Reports",
    icon: ClipboardList,
    accent: ACCENTS.indigo,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Close out in this order: Room assignment + Unassigned delegates (clear all referrals), Occupancy, Checked-in / Not-arrived / Check-out (chase not-arrived with hub reps).",
      },
      {
        text: "Key issuance and Key replacement must reconcile with the physical key board.",
      },
      {
        text: "Room change history and the Payment override report — the Accommodation Admin reviews every exceptional decision.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Offline sync exceptions and Check-in activity must reconcile with the conflicts panel — both at zero before the desk closes.",
      },
      {
        text: "Desk check-in (finance): confirm every ticked POA cash collection before closing.",
      },
    ],
    links: [
      { href: "/admin/reports", label: "Open ops reports" },
      { href: "/admin/desk-checkin", label: "Open desk check-in" },
    ],
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Marks the searched term inside a step, so it is obvious why it matched. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark
            key={index}
            className="rounded bg-amber-200/80 px-0.5 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function HelpRunbook() {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
      steps: section.steps.filter((step) =>
        `${section.title} ${step.heading ?? ""} ${step.text}`
          .toLowerCase()
          .includes(needle),
      ),
    })).filter((section) => section.steps.length > 0);
  }, [needle]);

  const stepCount = visible.reduce((sum, section) => sum + section.steps.length, 0);

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search the runbook… (e.g. override, offline, EBPV, keys)"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <LinkButton
          href="/admin/arrival"
          size="sm"
          variant="outline"
          className="h-9"
        >
          <BedDouble className="size-4" /> Arrival desk
        </LinkButton>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Printer className="size-4" /> Print
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(Object.keys(STEP_STYLES) as StepKind[]).map((kind) => {
            const style = STEP_STYLES[kind];
            const KindIcon = style.icon;
            return (
              <li key={kind} className="flex items-center gap-1.5">
                <KindIcon className={cn("size-3.5", style.text)} />
                <span className={cn("font-medium", style.text)}>{style.label}</span>
                <span>
                  —{" "}
                  {kind === "do"
                    ? "the required action"
                    : kind === "never"
                      ? "a rule that must not be broken"
                      : "what to do when it goes wrong"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          {needle
            ? `${visible.length} section(s) · ${stepCount} matching step(s)`
            : `${SECTIONS.length} sections · ${stepCount} steps`}
        </p>
      </div>

      {/* Jump chips stay under the console header, so a queue never means scrolling. */}
      <nav
        aria-label="Runbook sections"
        className="sticky top-16 z-20 flex flex-wrap items-center gap-1.5 rounded-xl border bg-background/95 px-2 py-1.5 backdrop-blur print:hidden"
      >
        {visible.map((section) => {
          const SectionIcon = section.icon;
          return (
            <a
              key={section.id}
              href={`#runbook-${section.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-95",
                section.accent.chip,
              )}
            >
              <SectionIcon className="size-3.5" />
              {section.short}
            </a>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in the runbook matches “{search}” — try a shorter word.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2 print:grid-cols-1">
          {visible.map((section) => {
            const SectionIcon = section.icon;
            return (
              <Card
                key={section.id}
                id={`runbook-${section.id}`}
                className={cn(
                  "scroll-mt-32 break-inside-avoid border-l-4 print:break-inside-avoid",
                  section.accent.rail,
                )}
              >
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-lg border",
                        section.accent.chip,
                      )}
                    >
                      <SectionIcon className="size-4" />
                    </span>
                    <p className="flex-1 font-medium">{section.title}</p>
                    <Badge variant="outline" className="text-[10px] tabular-nums">
                      {section.steps.length} step(s)
                    </Badge>
                  </div>

                  <ol className="space-y-2">
                    {section.steps.map((step, index) => {
                      const kindStyle = step.kind ? STEP_STYLES[step.kind] : null;
                      const KindIcon = kindStyle?.icon;
                      return (
                        <li
                          key={`${section.id}-${index}`}
                          className={cn(
                            "text-sm",
                            kindStyle
                              ? cn("rounded-lg border border-l-4 p-2", kindStyle.box)
                              : "flex gap-2",
                          )}
                        >
                          {kindStyle && KindIcon ? (
                            <>
                              <p
                                className={cn(
                                  "mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide",
                                  kindStyle.text,
                                )}
                              >
                                <span className="tabular-nums">
                                  {index + 1}.
                                </span>
                                <KindIcon className="size-3.5" />
                                {kindStyle.label}
                              </p>
                              <span className="text-muted-foreground dark:text-foreground/80">
                                <Highlight text={step.text} needle={needle} />
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                {index + 1}.
                              </span>
                              <span className="text-muted-foreground">
                                {step.heading ? (
                                  <Badge
                                    variant="outline"
                                    className="mr-1.5 h-5 rounded-full px-2 text-[10px]"
                                  >
                                    {step.heading}
                                  </Badge>
                                ) : null}
                                <Highlight text={step.text} needle={needle} />
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {section.links && section.links.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 border-t pt-2 print:hidden">
                      {section.links.map((link) => (
                        <LinkButton
                          key={link.href}
                          href={link.href}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                        >
                          {link.label} ↗
                        </LinkButton>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="mt-0.5 size-3.5 shrink-0" />
        Same document as RUNBOOK-NOV2.md in the repo. If a printed copy and this
        screen disagree, the screen wins — it ships with the console.
      </p>
    </div>
  );
}
