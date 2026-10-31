# Arrival-day runbook — November 3, 2026

Who this is for: the Accommodation Admin, venue staff, and finance on
conference arrival day. Every screen referenced below lives on the admin
console (https://home-coming-ten.vercel.app) and is role-gated server-side.

| Role | What they can do |
|---|---|
| Admin | Everything, including payment overrides, corrections, team management |
| Accommodation | Rooms, import, publishing, overrides, corrections, reports |
| Room assignment staff | Rooms/assignments/changes + check-in/out + keys |
| Check-in staff | Search, check-in/out, keys, moving a roomed delegate, undoing their own check-in, status views |
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
   created. Matching ignores case and extra spacing, so importing the same
   workbook twice never duplicates a room: a repeated row in the sheet is
   ignored (the first row wins), and leftover duplicate rows from earlier
   imports are retired — unless someone is still roomed in one, which is
   reported instead. A sheet without a building or gender column never wipes
   values set by hand in the UI. EBPV rows over 4 delegates are rejected at
   commit.
4. **Publish** — rooms become visible to hub reps the moment you publish. Reps
   see only published rooms and only their own delegates (§8). The **Publish…**
   menu on the Rooms tab does it in one pass: *all rooms*, *every room of one
   type*, or *a single block* when rooms carry a building. Unpublishing is per
   room from its card; publishing never blocks assignment or check-in — it only
   controls what reps can see.

If a room is wrong after the fact: `Move`/`change room` writes an append-only
history row — the old assignment is never deleted (§9). An import never
deletes a room that has vanished from the sheet, so when the venue replaces
its list, follow §6 to move the delegates out before deleting the old rooms.

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
6. **Undo a wrong check-in** — select the checked-in delegate → *Undo check-in*
   and give a reason (wrong person, wrong room, wrong hub). The arrival is
   removed, the delegate goes back to **Not Arrived** so they can be checked in
   again properly, and the reason plus a snapshot of the arrival (room, time,
   who checked them in, payment override) stay in the audit log. Every desk
   role can do this, check-in staff included. *Correct check-in* is the other
   repair: it keeps the arrival row marked corrected. Get a key back with
   *Mark key returned* — undoing an arrival never takes the key in.

## 3. Keys (§14–15)

Tracked for **Wise as Serpents**, **Good General** and **EBPV apartments**
only. Dorms/hostels get wristbands — nothing recorded.

- First arrival in a lodge room / EBPV apartment takes the key: the check-in
  dialog asks for the key recipient (defaults to the delegate). If keys are
  already out, the desk is told **who holds them** — direct later arrivals to
  that person to coordinate access.
- **Issue a key after arrival** — the delegate often goes to settle in first
  and comes back for the key. Select them on the desk card → *Issue key* and
  name who holds it (defaults to the delegate); the hand-over is added to the
  arrival already on file. A delegate with no arrival yet cannot be given a
  key, and a room keeps **one key open at a time**: if it is already out, the
  desk is told who has it and must mark it returned (or *Replace* it) first.
- **Arrival → Keys panel**: *Replace* (new key holder) and *Returned* per room.
  *Mark key returned* on the delegate's card does the same without a check-out.
  The full ledger is in the key issuance/replacement reports.

## 4. Offline stations (§19)

One designated device per building (dorm hexes need this — expect dead zones).

1. On the computer serving that building, open Arrival and pick that building
   as the location, then click **Designate this device**. A check-in account
   posted to that building can claim the station on first sign-in (the desk
   prompts when none exists yet); moving a live station to another device
   stays with an admin or the room team.
2. If connectivity drops, the station keeps a local queue; check-ins taken
   while disconnected read **Queued offline** and are sent by **Push and sync**
   (or automatically when the connection returns). Queued transactions are
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

## 6. Swapping the room inventory when the venue changes its list

Anagkazo (or any venue) can replace the list it first gave you. An import only
creates and updates rooms — it never deletes a room that has disappeared from
the sheet — so a withdrawn block stays live, and occupied, until you move the
delegates out and delete the rooms. Do it in this order:

1. **Import the new list first** — Accommodation → Rooms tab → *Import rooms*.
   The preview shows what will be created versus updated per type. If the new
   allocation is smaller than the confirmed pools, correct **Pools** first: an
   import can never exceed the pool for a type.
2. **Take a before-picture** — Ops reports → *Room assignment report*, exported
   to Excel. That is the roll-call list you reconcile against after the sweep.
3. **Pause assignment** — tell the desk to stop allocating while the sweep runs.
   If destination rooms are earmarked for a hub or block, *Reserve* them; a held
   room is refused by every assignment path until released.
4. **Move a room's delegates in one pass** — on the withdrawn room's card choose
   *Move*, tick the delegates (all are ticked by default), pick the destination
   and give a reason (e.g. “Anagkazo withdrew these rooms, 28 Oct”). The
   destination list only offers same-type rooms that are not reserved or faulty
   and have a free bed; the server re-checks type, capacity and the gender rules
   for the whole selection before anyone moves. Each delegate keeps a history
   chain — old room, new room, reason, who did it — including delegates already
   checked in. The desk's room and bed follow the move immediately.
5. **Work block by block, gender by gender.** Dormitories and hostels must stay
   single-sex, so move in batches that keep a room one gender; EBPV apartments
   hold at most four. For a single delegate the Arrival record's *Move delegate*
   does the same job one at a time. *Remove* on the members list is only for a
   delegate who has not checked in — it drops them back on the unassigned list
   for *Assign* / bulk assign, and a checked-in delegate would be left with no
   room.
6. **Keys stay with the old room.** For Wise as Serpents, Good General and EBPV
   apartments, mark the key *returned* on the old room and *issue* it on the new
   one at the desk. A move never carries a key across.
7. **Delete the vacated rooms** — *Delete* on the card, or *Delete rooms* by
   building/type. Bulk delete keeps any room that still holds delegates and
   lists their names, which is your checklist of who is left. Deletes are soft:
   *Deleted rooms → Restore* puts a room back.
8. **Publish the new rooms** from the *Publish…* menu and unpublish or delete the
   withdrawn ones, so reps see only the rooms the venue has actually given you.

If a move is refused: read the message — it names the room and the rule (only N
beds free, reserved/faulty, reserved for one gender, booked for a different
type). Fix the destination or the selection, then run it again; a refused batch
moves nobody.

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
