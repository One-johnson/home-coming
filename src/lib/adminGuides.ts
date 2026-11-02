/**
 * Per-page how-to content for the admin console.
 *
 * Every entry is written for someone standing at a desk: what the page is for,
 * the action that actually does the job, the rule that must not be broken, and
 * what a refusal means. The console header renders whichever entry matches the
 * current route (see `PageGuide`), so a page only needs a guide here — there is
 * no per-page wiring to forget.
 *
 * Keep the language identical to RUNBOOK-NOV3.md and HelpRunbook: if a screen
 * and the runbook disagree, the screen is what staff will follow.
 */

export type GuideStepKind = "do" | "never" | "if-fails";

export type GuideStep = {
  /** Omit for plain context steps that are neither a rule nor a recovery. */
  kind?: GuideStepKind;
  text: string;
};

export type AdminGuide = {
  /** Route this guide belongs to; matched by exact path or path prefix. */
  href: string;
  /** Screen name as the header shows it. */
  title: string;
  /** One line on what the page is for. */
  intro: string;
  steps: GuideStep[];
  /** Where the same job is written up in full. */
  runbookLink?: boolean;
};

export const ADMIN_GUIDES: AdminGuide[] = [
  {
    href: "/admin",
    title: "Overview",
    intro: "The shift-at-a-glance screen: queue counts, attention items and recent activity.",
    steps: [
      {
        kind: "do",
        text: "Start a shift here. The KPI row counts registrations, bookings and rooms still waiting on a decision; each attention item is a link to the page that clears it.",
      },
      {
        kind: "do",
        text: "Sidebar badges (Registrations, Accommodation, Emails) mirror the same queues — a badge is the quickest way to find work from any page.",
      },
      {
        kind: "if-fails",
        text: "Numbers are live queries. If a card looks stale, reload the page rather than assuming the queue is empty.",
      },
      {
        kind: "never",
        text: "Do not use this page as the record. Every decision is taken on the page the card links to, where the checks for that action run.",
      },
    ],
  },
  {
    href: "/admin/registrations",
    title: "Registrations",
    intro: "Hub registration submissions and the offline payments that come with them.",
    steps: [
      {
        kind: "do",
        text: "Work the queue top to bottom. Open a submission to see the hub's declared delegates, the amounts and the payment evidence attached to it.",
      },
      {
        kind: "do",
        text: "Approving turns a submission into a confirmed booking and releases its beds; rejecting sends it back to the hub with your reason so they can correct it.",
      },
      {
        kind: "if-fails",
        text: "An approval refused for capacity means the pool for that accommodation type is exhausted — correct it on Accommodation → Pools first, then approve.",
      },
      {
        kind: "never",
        text: "Never approve a payment you have not seen evidence for. The approval stamps your account on the booking and appears in the audit log.",
      },
    ],
  },
  {
    href: "/admin/accommodation",
    title: "Accommodation",
    intro: "Bookings review, payment-on-arrival, capacity pools, the room inventory and review flags.",
    steps: [
      {
        kind: "do",
        text: "The tabs across the top are the five jobs: Bookings (confirm or reject room bookings), Payment on arrival, Pools (confirmed capacity per type), Rooms (physical inventory and assignments) and Review flags.",
      },
      {
        kind: "do",
        text: "Rooms tab: Import rooms loads the venue's list, Assign puts unassigned delegates into a room, Move takes a room's delegates into a replacement room with one reason, Reserve holds a room out of allocation, Flag issue takes a faulty room out of inventory.",
      },
      {
        kind: "do",
        text: "Importing never deletes a room that has vanished from the sheet — a withdrawn block stays live (and occupied) until you move the delegates out and delete the rooms. The runbook's swap section walks through that order.",
      },
      {
        kind: "if-fails",
        text: "An import refused for exceeding a pool is a data problem, not a bug: correct the pool totals or the sheet first. A refused move names the rule — free beds, reserved/faulty room, one gender per dorm/hostel, or a different booked type.",
      },
      {
        kind: "never",
        text: "Never give out a reserved or faulty room from memory or an old printout; the server refuses it, and the pickers already exclude both.",
      },
    ],
    runbookLink: true,
  },
  {
    href: "/admin/arrival",
    title: "Arrival desk",
    intro: "Check-in, keys, room moves and offline stations for arrival day.",
    steps: [
      {
        kind: "do",
        text: "Pick the desk location (a building, or Central), then search by name, hub or room — two characters is enough. “/” focuses the search; Enter checks in a single ready match.",
      },
      {
        kind: "do",
        text: "Check in from the delegate's card. The row shows room, bed and key state; for key buildings the dialog asks who is holding the key, defaulting to the delegate.",
      },
      {
        kind: "do",
        text: "Move a delegate who already has a room with Move delegate — the room, the destination and a reason are required, and the old assignment stays in the history.",
      },
      {
        kind: "if-fails",
        text: "Duplicate check-in is refused with the original room and time: the first check-in stands, so do not retry from a second device. An unassigned delegate goes to Room-Assignment Staff or the Accommodation Admin — the desk cannot assign.",
      },
      {
        kind: "never",
        text: "Payment not confirmed may only be checked in by Admin/Accommodation with a written override reason. Undoing a check-in never takes a key back — mark the key returned separately.",
      },
    ],
    runbookLink: true,
  },
  {
    href: "/admin/desk-checkin",
    title: "Desk check-in",
    intro: "Payment-on-arrival cash collection at the door.",
    steps: [
      {
        kind: "do",
        text: "Search by booking reference, hub or guest name, then tick each delegate whose cash or transfer has actually been counted.",
      },
      {
        kind: "do",
        text: "Confirm one payment at a time — confirmation posts the payment, moves the booking to confirmed and rooms the delegate through the normal assignment rules.",
      },
      {
        kind: "never",
        text: "Never confirm a tick you have not physically collected. Every confirmation carries your account into the payment override and audit reports.",
      },
    ],
  },
  {
    href: "/admin/pre-arrival",
    title: "Pre-arrival",
    intro: "Readiness checks for November 3 — imports against pools, EBPV sanity, publishing and assignments.",
    steps: [
      {
        kind: "do",
        text: "Work top to bottom. Each check names what is missing and links to the screen that fixes it; fix, then reload the checklist.",
      },
      {
        kind: "if-fails",
        text: "A check that stays red after the fix usually means the change landed on another type or building — open the check's detail to see which slice it is measuring.",
      },
      {
        kind: "never",
        text: "Do not publish rooms or assign delegates just to turn a check green. Publish after the inventory is right; assign after the pools and rooms are.",
      },
    ],
  },
  {
    href: "/admin/reports",
    title: "Ops reports",
    intro: "Operational exports — room assignment, occupancy, check-in state, keys, overrides and offline exceptions.",
    steps: [
      {
        kind: "do",
        text: "Pick the report, set the accommodation type / building / gender filters, then export to Excel. Print a live view when you need a PDF.",
      },
      {
        kind: "do",
        text: "Close the day in this order: Room assignment + Unassigned delegates (clear every referral), Occupancy, then Checked-in / Not-arrived / Check-out (chase not-arrived with hub reps), then the key reports against the physical key board.",
      },
      {
        kind: "if-fails",
        text: "A report that disagrees with the desk is usually a filter — clear type/building and re-run before escalating to the Accommodation Admin.",
      },
      {
        kind: "never",
        text: "Reports only read. Corrections are made on the desk (Undo check-in, Correct check-in, Move delegate) so the audit trail keeps the reason.",
      },
    ],
    runbookLink: true,
  },
  {
    href: "/admin/directory",
    title: "Delegate directory",
    intro: "Read-only lookup of every rep, delegate, room and bed.",
    steps: [
      {
        kind: "do",
        text: "Filter by rep, building or room to walk a delegate to the right bed; search a name to open their hub, room, bed and booking reference.",
      },
      {
        kind: "if-fails",
        text: "Someone missing from the directory has no active booking — check Registrations, or the hub's roster.",
      },
      {
        kind: "never",
        text: "Nothing here edits. Room changes belong on the Arrival desk or the Rooms tab, where the history is written.",
      },
    ],
  },
  {
    href: "/admin/finance/accommodations",
    title: "Accommodations (finance)",
    intro: "Read-only financial view of accommodation bookings and payments.",
    steps: [
      {
        kind: "do",
        text: "Filter to the bookings you are reconciling and open a row to see its payment state, reference and any override.",
      },
      {
        kind: "do",
        text: "For a spreadsheet reconciliation, use Ops reports → bookings/payment overrides; this screen is the quick check, not the export.",
      },
      {
        kind: "never",
        text: "This view does not confirm payments. POA cash is confirmed at Desk check-in; offline evidence is approved on Registrations.",
      },
    ],
  },
  {
    href: "/admin/hubs-reps",
    title: "Hubs & reps",
    intro: "Per-hub roster, activity and drill-down.",
    steps: [
      {
        kind: "do",
        text: "Open a hub to see its reps, delegates, rooms and recent activity; use the drill-down to find a delegate whose registration or payment is missing.",
      },
      {
        kind: "if-fails",
        text: "A hub with no rep account cannot register delegates — an admin adds the rep on the same page first.",
      },
      {
        kind: "never",
        text: "Approvals and room decisions stay on their own pages; this one is for finding out who is where.",
      },
    ],
  },
  {
    href: "/admin/tours",
    title: "Tours",
    intro: "Tour packages and the orders taken against them.",
    steps: [
      {
        kind: "do",
        text: "Create or edit a package (name, date, price, capacity), then open its orders to see who has booked and what they have paid.",
      },
      {
        kind: "if-fails",
        text: "An order that cannot be placed is usually capacity or a closed package — reopen it or raise the capacity, then re-check the order.",
      },
      {
        kind: "never",
        text: "Do not change a price after orders exist without telling finance; the order keeps the price it was taken at.",
      },
    ],
  },
  {
    href: "/admin/hotels",
    title: "Hotels",
    intro: "Preferred commercial hotels near campus, for delegates who are not in venue accommodation.",
    steps: [
      {
        kind: "do",
        text: "Sync the seed list from the hotels PDF, then edit names, distance, rates and contacts as the hotels confirm them.",
      },
      {
        kind: "never",
        text: "These are recommendations, not inventory — nothing here consumes or reserves a bed, and no delegate is assigned to a hotel from this page.",
      },
    ],
  },
  {
    href: "/admin/content",
    title: "Content",
    intro: "Public FAQs and announcements.",
    steps: [
      {
        kind: "do",
        text: "Add an FAQ with a category, question, answer and order; the category groups it on the public FAQ page and the order sets its position.",
      },
      {
        kind: "do",
        text: "Announcements have a title, body and an active switch. Unticking active hides it from the site without deleting it.",
      },
      {
        kind: "if-fails",
        text: "An edit that does not appear publicly is usually an inactive announcement or a cached page — check the switch, then reload the public page.",
      },
      {
        kind: "never",
        text: "Deleting an FAQ is permanent (bulk delete included). Unpublish or reword instead when the answer may be needed again.",
      },
    ],
  },
  {
    href: "/admin/hero",
    title: "Hero",
    intro: "Homepage hero images and their order.",
    steps: [
      {
        kind: "do",
        text: "Upload an image, then set its order — the first image is what the homepage opens with.",
      },
      {
        kind: "if-fails",
        text: "A rejected upload is usually size or format; export a web-sized JPEG/WebP and try again.",
      },
      {
        kind: "never",
        text: "Check the image reads well with the homepage text over it before you put it first.",
      },
    ],
  },
  {
    href: "/admin/videos",
    title: "Videos",
    intro: "The conference message and the video links shown on the public site.",
    steps: [
      {
        kind: "do",
        text: "Set the conference message and add video links one item at a time, saving each; the public media page lists them in the order shown here.",
      },
      {
        kind: "if-fails",
        text: "A link that will not play is usually a share URL rather than a direct video URL — open it in a private window to confirm it plays before saving.",
      },
      {
        kind: "never",
        text: "Do not remove last year's message until the new one is uploaded and playing.",
      },
    ],
  },
  {
    href: "/admin/galleries",
    title: "Galleries",
    intro: "Photo albums for the public gallery.",
    steps: [
      {
        kind: "do",
        text: "Create an album, upload the photos into it, then set the order; the public gallery follows that order.",
      },
      {
        kind: "if-fails",
        text: "An upload that fails is usually file size or format — resize to a web-sized JPEG and retry.",
      },
      {
        kind: "never",
        text: "Deleting an album or photo removes it from the public gallery; there is no restore, so keep the originals.",
      },
    ],
  },
  {
    href: "/admin/team",
    title: "Team",
    intro: "Staff accounts, roles and the team sign-in doors.",
    steps: [
      {
        kind: "do",
        text: "Create team member: full name, email, a temporary password (8+ characters) and a role. The account signs in at its own door — /admin, /registration, /accommodation, /finance, /content, /room-assignment or /check-in.",
      },
      {
        kind: "do",
        text: "Change a role or deactivate someone from their member card. The server refuses any change that would leave no active admin.",
      },
      {
        kind: "if-fails",
        text: "A sign-in refused at a team URL is a role mismatch, not a password problem — check the role here, then send the person to the matching door.",
      },
      {
        kind: "never",
        text: "Never let a desk share one account. Every check-in, key issue and override is stamped with the signed-in identity, and a shared login destroys that trail.",
      },
    ],
    runbookLink: true,
  },
  {
    href: "/admin/audit",
    title: "Audit log",
    intro: "Who did what, across the console.",
    steps: [
      {
        kind: "do",
        text: "Filter by actor, action or entity to reconstruct a decision — room moves, overrides, corrections and deletions all carry the reason given at the time.",
      },
      {
        kind: "if-fails",
        text: "An event you expected is missing: widen the date range and clear filters before concluding it was never recorded.",
      },
      {
        kind: "never",
        text: "Bulk-deleting audit events is permanent and removes the evidence other reports rely on. Export first, and only delete with the Accommodation Admin's agreement.",
      },
    ],
  },
  {
    href: "/admin/settings",
    title: "Settings",
    intro: "Deadline, payment details, pricing, capacity pools and operations switches.",
    steps: [
      {
        kind: "do",
        text: "Each section saves on its own. Capacity pools are the confirmed inventory per accommodation type — imports, bookings and approvals are all checked against them.",
      },
      {
        kind: "do",
        text: "Operations holds the behaviour switches, including auto-assign, which stays off until a super admin arms it.",
      },
      {
        kind: "if-fails",
        text: "Changing a pool can make existing bookings or assignments sit above capacity; the server refuses the change rather than silently overbooking — move delegates or rooms first.",
      },
      {
        kind: "never",
        text: "Do not raise a pool to make an import fit unless the venue has confirmed the extra beds. The pool is the number finance and reports trust.",
      },
    ],
  },
  {
    href: "/admin/profile",
    title: "Profile",
    intro: "Your own account details and security.",
    steps: [
      {
        kind: "do",
        text: "Update your name and change your password here. Use a password you do not use anywhere else — the account is the identity on every action you take.",
      },
      {
        kind: "if-fails",
        text: "If you are signed out unexpectedly, sign in again from your team's door; repeated expiries mean the session lapsed, not that the account is locked.",
      },
    ],
  },
  {
    href: "/admin/groups",
    title: "Groups",
    intro: "Arrival groups used by group check-in at the desk.",
    steps: [
      {
        kind: "do",
        text: "Open a group to see the delegates it contains, then use the Arrival desk's Group check-in to tick only the delegates who physically arrived.",
      },
      {
        kind: "never",
        text: "A group is a convenience for the desk, not a check-in: nothing in a group is checked in automatically.",
      },
    ],
  },
  {
    href: "/admin/help",
    title: "Arrival runbook",
    intro: "The full runbook, searchable, with the same words as the printed copy.",
    steps: [
      {
        kind: "do",
        text: "Search a keyword (override, offline, EBPV, keys, swap), open a section, or print the whole thing for the desk.",
      },
      {
        kind: "do",
        text: "Each section links to the screen it talks about, so you can read a step and be on the page in one tap.",
      },
      {
        kind: "never",
        text: "If a printed copy and this screen disagree, this screen wins — it ships with the console.",
      },
    ],
  },
];

/**
 * The guide for a route. Matched the way the shell matches page titles, with
 * the longest href winning so `/admin/finance/accommodations` never falls back
 * to a broader guide.
 */
export function getAdminGuide(pathname: string): AdminGuide | undefined {
  let best: AdminGuide | undefined;
  for (const guide of ADMIN_GUIDES) {
    const matches =
      guide.href === "/admin"
        ? pathname === "/admin"
        : pathname === guide.href || pathname.startsWith(`${guide.href}/`);
    if (!matches) continue;
    if (!best || guide.href.length > best.href.length) best = guide;
  }
  return best;
}
