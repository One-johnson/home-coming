# Arrival-day runbook — November 2, 2026

Who this is for: the Accommodation Admin, venue staff, and finance on
conference arrival day. Every screen referenced below lives on the admin
console (https://home-coming-ten.vercel.app) and is role-gated server-side.

| Role | What they can do |
|---|---|
| Admin | Everything, including payment overrides, corrections, team management |
| Accommodation | Rooms, import, publishing, overrides, corrections, reports |
| Room assignment staff | Rooms/assignments/changes + check-in/out + keys |
| Check-in staff | Search, check-in/out, keys, status views only |
| Finance | Registrations/POA verification, cash-collection desk, audit log |

Each team has its own sign-in URL: **/admin** (admins), **/registration**,
**/accommodation**, **/finance**, **/content**, **/room-assignment** (room
assignment staff) and **/check-in** (check-in staff). A team URL only accepts
that team's accounts; anyone with the wrong role is pointed to the correct
door instead of being signed in. Both venue staff doors land on the arrival
desk.

Workstation accounts are created in **Team** (see "Adding team & venue staff
accounts" at the bottom). Each person signs in with their own account on the
device they will use — that identity is stamped on every check-in, key issue
and override, and shows up in the audit log and reports.

---

## 1. Import the physical room inventory (once, before arrival)

Route: **Accommodation → Rooms tab** (Steps 7–12).

1. **Upload the workbook** — the Rooms tab template is the team's own layout.
   One sheet per accommodation type, a title row, then a header row
   (*NO. OF ROOMS, ROOM NUMBER / Apartment name, CAPACITY*) with one room per
   row underneath. The sheet name or title says which type it is; the
   "NO. OF ROOMS" counter is ignored. There is no gender column — staff assign
   delegates and check them in manually at the desk.
   - Hostels with/without heater both import as hostel rooms.
   - Dormitory/hostel: one row per room, or one row with the bed total for
     unnumbered halls (Mighty Fortress).
   - EBPV: one row per apartment, capacity 4, mixed automatically.
2. **Preview import** — the parser reports `invalidRows` by sheet and row
   (missing name, bad capacity) and the preview compares the imported total per
   type against the Phase 1 confirmed inventory pools. An import may never
   exceed a pool; fix the sheet or the pool first.
3. **Commit** — same-named rows update capacity/building in place, others are
   created. EBPV rows over 4 delegates are rejected at commit.
4. **Publish** — rooms (or the whole block) become visible to hub reps the
   moment you publish. Reps see only published rooms and only their own
   delegates (§8). Publish per building as rooms become ready.

If a room is wrong after the fact: `Move`/`change room` writes an append-only
history row — the old assignment is never deleted (§9).

## 2. Desk check-in (§11–§18)

Route: **Arrival** (`/admin/arrival`). Pick the desk **location** (a building,
or Central) and then:

1. **Individual check-in** — search by name or hub (2+ characters). Each card
   shows hub, room, payment state and check-in status. Confirm check-in per
   delegate. Duplicate attempts are refused loudly: *ALREADY CHECKED IN — room
   · time*.
2. **Unassigned delegates** — check-in staff see a referral prompt: send the
   delegate to Room-Assignment Staff / the Accommodation Admin. Check-in staff
   cannot assign rooms.
3. **Payment not confirmed** — Admin/Accommodation only: enter a reason in the
   override box. Ordinary staff can never check in an unconfirmed booking; the
   override reason is stored on the record and lands in the override report.
4. **Group check-in (§13)** — the "Group check-in" card: pick the **hub or
   arrival group**, tick only the delegates who physically arrived, *Check in N
   arrived*. The rest of the group stays Not Arrived — the system never
   auto-checks-in an unticked delegate.
5. **Check-out (§20)** — optional, never releases paid inventory. For dorms/
   hostels a wristband return is not tracked; for key rooms choose
   *Key returned / not returned*.

## 3. Keys (§14–15)

Tracked for **Wise as Serpents**, **Good General** and **EBPV apartments**
only. Dorms/hostels get wristbands — nothing recorded.

- First arrival in a lodge room / EBPV apartment takes the key: the check-in
  dialog asks for the key recipient (defaults to the delegate). If keys are
  already out, the desk is told **who holds them** — direct later arrivals to
  that person to coordinate access.
- **Arrival → Keys panel**: *Replace* (new key holder) and *Returned* per room.
  The full ledger is in the key issuance/replacement reports.

## 4. Offline stations (§19)

One designated device per building (dorm hexes need this — expect dead zones).

1. On the computer serving that building, open Arrival and pick that building
   as the location; an Admin (or the first staff member if none exists yet)
   clicks **Designate this device**.
2. If connectivity drops, the station keeps a local queue; on reconnect click
   **Sync now** (or the queue replays itself). Queued transactions are
   idempotent by txId.
3. Conflicts (e.g. the delegate was already checked in centrally while the
   station was offline) are **never applied silently** — they appear in the
   "Offline sync exceptions" panel for Admin/Accommodation to mark applied or
   rejected. Keep this panel at zero before end of day.

## 5. End-of-day reports (§24)

Route: **Ops reports** (`/admin/reports`), every list filterable by
accommodation type / building / gender and exportable to Excel:

1. Room assignment report & Unassigned delegates — close out every unassigned
   delegate's referral.
2. Occupancy report — actual heads vs. pool per type/building.
3. Checked-in / Not-arrived / Check-out — chase not-arrived with hub reps
   before doors.
4. Key issuance & Key replacement — verify every tracked room's keys reconcile
   with the physical board.
5. Room change history, Payment override report — for the Accommodation Admin
   to review exceptional decisions.
6. Offline sync exceptions & Check-in activity — must reconcile with the
   conflicts panel.

Plus a **POA reconciliation** with the cash-collection desk (Desk check-in
route, finance role): every tick collected is one tap to confirm.

---

## Adding team & venue staff accounts

Admin console → **Team** (`/admin/team`), only Admins can access it:

1. **Create team member** — full name, email, temporary password (min 8
   characters), and a role from the picker (Admin, Content, Registration,
   Accommodation, Finance, **Room assignment staff**, **Check-in staff**).
   The new account signs in at its team URL: room assignment staff at
   /room-assignment, check-in staff at /check-in (both land on the arrival
   desk).
   Passwords are stored hashed; the person changes it on first sign-in or via
   the admin password-reset page.
2. Change a role or deactivate anyone later from the same page's member
   cards — the server refuses changes that would leave zero active admins.
3. Who created/changed what ends up in **Audit** with actor email.

New venue staff only see the **Arrival** surface and only the actions their
role allows — enforced in Convex, not just hidden in the UI.
