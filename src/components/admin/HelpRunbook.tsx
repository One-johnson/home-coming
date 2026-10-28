"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  KeyRound,
  ListChecks,
  Lock,
  Printer,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  WifiOff,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/app-button";
import { cn } from "@/lib/utils";

/**
 * The arrival-day runbook (RUNBOOK-NOV3.md at the repo root), embedded in the
 * console so venue staff can open it from a station on November 3 even if the
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
  rose: {
    rail: "border-l-rose-500",
    chip: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    icon: "text-rose-700 dark:text-rose-400",
    surface: "bg-rose-50/60 dark:bg-rose-950/20",
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
        text: "Room assignment staff — sign in at /room-assignment: they own the room inventory (import, publish, reserve, fault, delete), assign, move and unassign delegates, and run every desk action — overrides, corrections, clearing flags and resolving offline conflicts. They do not review bookings, pools or POA; money screens stay with Admin, Accommodation and Finance.",
      },
      {
        text: "Check-in staff — sign in at /check-in: search, check-in/out, keys, moving a delegate who already has a room, undoing a check-in they took, and status views. They cannot assign a delegate who has no room, change delegate details or clear a flag.",
      },
      {
        text: "Venue staff can be posted to one building on the Team page. A check-in account lands on that building's desk and cannot switch away, so it only ever sees that building's rooms and delegates.",
      },
      {
        text: "Anyone on the desk can raise a room fault (broken toilet, no water) from the Out of service panel, and anyone in the room team can fix it.",
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
        text: "Pick your desk location (a building, or Central), then search by name or hub (2+ characters). “/” focuses the search and Enter checks in a single ready match. A posted check-in account opens on its own building and cannot switch away.",
      },
      {
        text: "The strip at the top is the shift at a glance: checked in, checked out, not arrived, keys issued, keys returned, unassigned, and reserved and faulty rooms at this desk. Each delegate tile is also a filter — tap Unassigned or Not arrived to narrow the sheet to exactly those people, tap it again (or “Show all”) to return. The two room tiles are read-only: reserved rooms hold no delegates.",
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
        heading: "Do",
        kind: "do",
        text: "Bulk check-in: tick ready delegates directly in the desk sheet (ready = bed + confirmed payment; other rows cannot be ticked), or “Select all ready”, then “Check in N”. Rejections are listed by name and reason — section 8 covers the details.",
      },
      {
        text: "Check-out is optional and never releases paid inventory. Dorms/hostels: wristband, not tracked. Key rooms: record Key returned / not returned.",
      },
      {
        text: "Room search: type a room number under the search box and a strip lists matching rooms with their type, building, occupancy and whether they are reserved or faulty — the one way to find an empty room, since an empty room has no delegate to match.",
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
        heading: "Do",
        kind: "do",
        text: "Issue a key after arrival: select the delegate on the desk card → Issue key, and name who holds it (defaults to the delegate). Use this when the delegate went to settle in first and came back for the key — the arrival is already recorded, so the hand-over is added to it without re-running the check-in.",
      },
      {
        text: "One key stays open per room. If it is already out, Issue key refuses and names the holder — mark it returned first, or Replace it in the Keys panel if the key changed hands. A delegate with no arrival yet cannot be given a key, and dormitory/hostel wristbands are never recorded.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Mark key returned from the same card as soon as the key comes back, even if the delegate has not checked out. The room then shows Pending or Returned and the key can be issued again.",
      },
      {
        text: "Arrival → Keys panel: the heading counts keys out and keys returned, then Replace (new key holder) and Returned per room. The full ledger is in the key reports.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Undoing a check-in does not take back a key. The key physically left the drawer, so the desk is told who still holds it and must mark it returned when it comes back.",
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
        text: "Designate ONE device per building: on that computer, open Arrival, pick the building as the location, then “Designate this device”. A check-in account posted to that building can claim it on first sign-in (the desk shows the prompt when no station exists yet), so a dead-zone desk does not wait for an admin. Moving a station to another device stays with an admin or the room team.",
      },
      {
        text: "If connectivity drops, check-ins are taken on the device: the row reads “Queued offline” and the desk panel counts them. Push them with “Push and sync” — or leave it, because they are sent automatically when the connection returns. Queued transactions are idempotent by transaction id, so a repeated push never checks anyone in twice.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Conflicts (e.g. the delegate was checked in centrally while the station was offline) are never applied silently — resolve them in “Offline sync exceptions” (Admin, Accommodation or Room assignment). Keep it at zero before end of day.",
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
  {
    id: "rooms",
    title: "6. Rooms: reserving, faults and the stock numbers",
    short: "6 · Rooms",
    icon: Wrench,
    accent: ACCENTS.rose,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Rooms tab → the strip at the top is live stock: Available (beds and rooms), Reserved, Faulty, Occupied, Awaiting a room, and keys out/returned. If a number surprises you, open the room group under it — the cards show who is in each room.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Reserve a room: Rooms → Reserve on an empty room, and write why — the reason is required and shows on the card. A reserved room is held out of Assign, bulk assign and every change-room picker, and auto-assign skips it. Apply reserve to several rooms from the bulk bar and they are held in one step. The desk sees the same holds, read-only, in Desk overview & tools → Reserved rooms.",
      },
      {
        text: "Release a reservation with Release on the card (or release several from the bulk bar) when the held beds are needed again. A room that still holds delegates cannot be reserved, and a reserved room cannot be assigned into — release it first, then assign.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Flag a fault: Rooms → Flag issue, or the desk's Out of service panel → Flag a room. Pick the category and write what is wrong — the note is required. “Take this room out of inventory” is ticked by default, so the room counts as Faulty and cannot be given to anyone. Untick it for a remark that should not withdraw the room.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "A faulty room's card turns red, the desk marks the delegate's row Faulty, and the check-in and room-change dialogs repeat the warning. Fix it with Mark fixed on the room card — resolving the last blocking fault puts the room straight back into the available stock.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Check a room's fault history before giving it out: every card with past repairs carries Fault history (n) under its open problems. Open it to see what was fixed, when, by whom and the fix note. A category that keeps coming back is named in the collapsed line — “recurring: Toilet ×3” — so a room that has been patched repeatedly is not mistaken for a one-off.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Never give out a reserved or faulty room from memory or an old list. The server refuses it and the bed would be double-booked; use the live picker, which already excludes both.",
      },
      {
        text: "Auto-assign is off unless a super admin turns it on in Settings → Operations. While it is off the button on the rooms screen is disabled and the server refuses the action; manual assignment works either way. When it is on, it fills free beds from the matching queue and still skips reserved and faulty rooms.",
      },
    ],
    links: [
      { href: "/admin/accommodation?tab=rooms", label: "Open Rooms tab" },
      { href: "/admin/arrival", label: "Arrival desk" },
    ],
  },
  {
    id: "walkin",
    title: "7. Last-minute delegates (volunteers and substitutions)",
    short: "7 · Walk-ins",
    icon: UserPlus,
    accent: ACCENTS.indigo,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Rooms → Add last-minute delegate: hub, title, first name, last name, gender and accommodation type, plus an optional note such as “Volunteer on the media team”. Both names and a hub are required.",
      },
      {
        text: "This creates a confirmed, zero-value booking for one guest. No payment is recorded and no capacity-pool inventory is consumed. From that moment the volunteer behaves like any other delegate: they appear in Assign and the desk queue, take a bed, and check in normally.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "The hub has to exist with a representative account before it can take a walk-in. If the hub is missing, ask an admin to add it on the Hubs page first — then add the delegate.",
      },
      {
        heading: "Never",
        kind: "never",
        text: "Do not enter a paid delegate as a walk-in. Paid delegates come from their hub's booking so their payment, reference number and reports stay correct — use Assign for them.",
      },
    ],
    links: [{ href: "/admin/accommodation?tab=rooms", label: "Open Rooms tab" }],
  },
  {
    id: "desktools",
    title: "8. Desk tools: bulk check-in, corrections, flags and sync failures",
    short: "8 · Desk tools",
    icon: ClipboardList,
    accent: ACCENTS.violet,
    steps: [
      {
        heading: "Do",
        kind: "do",
        text: "Bulk check-in: tick ready delegates in the desk sheet (ready means a bed plus confirmed payment — other rows cannot be ticked), or “Select all ready”, then “Check in N”. One refusal does not stop the rest; the result lists who was rejected and why. Unticked delegates stay Not Arrived.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Undo a wrong check-in: select the checked-in delegate → Undo check-in, with a required reason (wrong person at the counter, wrong room, wrong hub). The arrival is removed and the delegate returns to Not Arrived, ready to be checked in again properly. The reason and a snapshot of the arrival — room, time, who did it, location, any payment override — stay in the audit log. Every desk role can do this, including check-in staff.",
      },
      {
        text: "Correct check-in is the other repair: it keeps the arrival row and marks it corrected, for a record that needs a written reason against it. Both actions put the delegate back on the Not Arrived list, so use Undo when the arrival should never have happened and Correct when you are annotating one that did. Neither reclaims a key — return it separately.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Correct a name or gender: select the delegate → Correct name / gender, with a reason. Super admin, Accommodation, Room assignment and the review queue can all do it; every change lands in the audit trail with the old value, the new value and the reason.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "A gender change is refused while it would break the room the delegate is already in. Move them to a suitable room first, then correct the record.",
      },
      {
        heading: "Do",
        kind: "do",
        text: "Flag a record for review: Flag for review with a note. The delegate can still be checked in; the flag waits in the Accommodation Admin's Review flags tab until someone clears it with a resolution note — from the queue or straight from the desk card.",
      },
      {
        heading: "If it fails",
        kind: "if-fails",
        text: "Offline sync exceptions (Desk overview & tools) lists every queued transaction that did not apply. Resolve each one as applied or rejected with a note, and get the list back to zero before close-out. Accommodation and Room assignment staff can do this too.",
      },
    ],
    links: [
      { href: "/admin/arrival", label: "Arrival desk" },
      { href: "/admin/accommodation?tab=flags", label: "Review flags" },
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
  /** Sections the reader has opened. Everything starts folded — a long
   * runbook is browsed by section, and printing still renders every card. */
  const [openIds, setOpenIds] = useState<string[]>([]);
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

  /** A search always reveals its hits, even if the reader had them folded. */
  const isOpen = (id: string) =>
    needle.length > 0 || openIds.includes(id);
  const allOpen = visible.length > 0 && visible.every((section) => isOpen(section.id));

  function toggleSection(id: string) {
    setOpenIds((previous) =>
      previous.includes(id)
        ? previous.filter((entry) => entry !== id)
        : [...previous, id],
    );
  }

  function setAllSections(open: boolean) {
    setOpenIds(open ? visible.map((section) => section.id) : []);
  }

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
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {needle
              ? `${visible.length} section(s) · ${stepCount} matching step(s)`
              : `${SECTIONS.length} sections · ${stepCount} steps`}
          </p>
          <button
            type="button"
            onClick={() => setAllSections(!allOpen)}
            className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors hover:bg-muted"
          >
            {allOpen ? "Fold all" : "Open all"}
          </button>
        </div>
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
              onClick={() =>
                setOpenIds((previous) =>
                  previous.includes(section.id)
                    ? previous
                    : [...previous, section.id],
                )
              }
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
            const open = isOpen(section.id);
            return (
              <Card
                key={section.id}
                id={`runbook-${section.id}`}
                className={cn(
                  "scroll-mt-32 break-inside-avoid border-l-4 print:break-inside-avoid",
                  section.accent.rail,
                )}
              >
                <CardContent className={cn("p-4", open ? "space-y-2.5" : "py-3")}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={open}
                    aria-controls={`runbook-body-${section.id}`}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg border",
                        section.accent.chip,
                      )}
                    >
                      <SectionIcon className="size-4" />
                    </span>
                    <span className="flex-1 font-medium">{section.title}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] tabular-nums print:hidden"
                    >
                      {section.steps.length} step(s)
                    </Badge>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform print:hidden",
                        open ? "rotate-180" : null,
                      )}
                    />
                  </button>

                  <div
                    id={`runbook-body-${section.id}`}
                    className={cn("space-y-2.5", open ? "block" : "hidden print:block")}
                  >
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
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="mt-0.5 size-3.5 shrink-0" />
        Same document as RUNBOOK-NOV3.md in the repo. If a printed copy and this
        screen disagree, the screen wins — it ships with the console.
      </p>
    </div>
  );
}
