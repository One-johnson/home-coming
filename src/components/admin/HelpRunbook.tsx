"use client";

import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The arrival-day runbook (RUNBOOK-NOV2.md at the repo root), embedded in the
 * console so venue staff can open it from a station on November 2 even if the
 * repo is not at hand. Searchable by keyword.
 */

type RunbookSection = {
  id: string;
  title: string;
  steps: { heading?: string; text: string }[];
};

const SECTIONS: RunbookSection[] = [
  {
    id: "who",
    title: "Who can do what",
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
  },
  {
    id: "import",
    title: "1. Import the physical room inventory (before arrival)",
    steps: [
      {
        text: "Accommodation → Rooms tab → Steps 7–12. Download the template and fill one row per room/apartment: Accommodation location, Building / block, Room number or apartment name, Room capacity, Gender (blank = any).",
      },
      {
        text: "Dormitory/hostel: one row per room, or one row with the bed total for unnumbered halls (Mighty Fortress). EBPV: one row per apartment, capacity 4, no gender — apartments are mixed.",
      },
      {
        text: "Preview first: the parser reports invalid rows by row number, and the preview compares the imported total per type against the confirmed inventory pools. An import may never exceed a pool — fix the sheet or the pool first.",
      },
      {
        text: "Commit: same-named rows update in place, others are created. EBPV rows over 4 delegates are rejected.",
      },
      {
        text: "Publish per building as rooms become ready — reps see only published rooms and only their own delegates.",
      },
    ],
  },
  {
    id: "checkin",
    title: "2. Desk check-in (Arrival screen)",
    steps: [
      {
        text: "Pick your desk location (a building, or Central), then search by name or hub (2+ characters).",
      },
      {
        text: "Check in each delegate individually. Duplicate attempts are refused loudly: ALREADY CHECKED IN — room · time.",
      },
      {
        text: "Unassigned delegates: show the referral prompt — send them to Room-Assignment Staff or the Accommodation Admin. Check-in staff cannot assign rooms.",
      },
      {
        text: "Payment not confirmed: Admin/Accommodation only may check the delegate in with a written override reason. The reason is stored and reported.",
      },
      {
        text: "Group check-in: pick the hub or arrival group, tick ONLY the delegates who physically arrived, then 'Check in N arrived'. The rest of the group stays Not Arrived — nothing is auto-checked-in.",
      },
      {
        text: "Check-out is optional and never releases paid inventory. Dorms/hostels: wristband, not tracked. Key rooms: record Key returned / not returned.",
      },
    ],
  },
  {
    id: "keys",
    title: "3. Keys (Wise as Serpents / Good General / EBPV)",
    steps: [
      {
        text: "Keys are tracked only for Wise as Serpents, Good General, and EBPV apartments. Dorms/hostels get wristbands — nothing is recorded.",
      },
      {
        text: "First arrival in a lodge room / EBPV apartment takes the key: the check-in dialog asks for the key recipient (defaults to the delegate).",
      },
      {
        text: "If keys are already out, the desk is told who holds them — direct later arrivals to that person to coordinate access.",
      },
      {
        text: "Arrival → Keys panel: Replace (new key holder) and Returned per room. The full ledger is in the key reports.",
      },
    ],
  },
  {
    id: "offline",
    title: "4. Offline stations (dead zones)",
    steps: [
      {
        text: "Designate ONE device per building: on that computer, open Arrival, pick the building as the location, then Admin (or the first staff member) clicks 'Designate this device'.",
      },
      {
        text: "If connectivity drops, the station queues actions locally; on reconnect click 'Sync now'. Queued transactions are idempotent by transaction id.",
      },
      {
        text: "Conflicts (e.g. the delegate was checked in centrally while the station was offline) are never applied silently — resolve them in 'Offline sync exceptions' (Admin/Accommodation). Keep it at zero before end of day.",
      },
    ],
  },
  {
    id: "reports",
    title: "5. End-of-day reports (Ops reports screen)",
    steps: [
      {
        text: "Close out in this order: Room assignment + Unassigned delegates (clear all referrals), Occupancy, Checked-in / Not-arrived / Check-out (chase not-arrived with hub reps).",
      },
      {
        text: "Key issuance and Key replacement must reconcile with the physical key board.",
      },
      {
        text: "Room change history and the Payment override report — the Accommodation Admin reviews every exceptional decision.",
      },
      {
        text: "Offline sync exceptions and Check-in activity must reconcile with the conflicts panel.",
      },
      {
        text: "Desk check-in (finance): confirm every ticked POA cash collection before closing.",
      },
    ],
  },
];

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

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search the runbook… (e.g. override, offline, EBPV, keys)"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in the runbook matches &quot;{search}&quot; — try a shorter
          word.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((section) => (
            <Card key={section.id}>
              <CardContent className="space-y-2.5 p-4">
                <p className="flex items-center gap-2 font-medium">
                  <BookOpen className="size-4 shrink-0 text-primary" />
                  {section.title}
                </p>
                <ol className="space-y-2">
                  {section.steps.map((step, i) => (
                    <li key={`${section.id}-${i}`} className="flex gap-2 text-sm">
                      {step.heading ? (
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 rounded-full px-2 text-[10px]"
                        >
                          {step.heading}
                        </Badge>
                      ) : (
                        <span
                          className={cn(
                            "mt-0.5 shrink-0 text-xs font-semibold tabular-nums",
                            "text-muted-foreground",
                          )}
                        >
                          {i + 1}.
                        </span>
                      )}
                      <span className="text-muted-foreground">{step.text}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
