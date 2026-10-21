# Phase 2 — Analysis & Step B Plan

Source: `Phase 2 ATTEMPT GREAT THINGS CONFERENCE 2026.docx` (32 sections, 6 priorities in §31).
Conference arrival: **November 2, 2026.**

---

## 1. Gap analysis — spec vs. what the codebase already has

Phase 1 (rep portal, hubs, delegates, bookings, payments, inventory pools) plus the
recent room-assignment/POA-desk work already satisfies a surprising amount of the
spec. Mapping every Phase 2 requirement to existing code:

| Spec | Requirement | Status in code |
|---|---|---|
| §26 | Use Phase 1 rep/hub/delegate/booking/payment records, no second DB | ✅ `agcRooms` / `agcRoomAssignments` already link to `agcGuests` + `agcBookings` |
| §4 | Assign only confirmed (or POA) delegates; manual assigns | ✅ `isRoomableBooking` in `convex/agcRoomAssignments.ts` |
| §5 | Assignment screen: unassigned delegates ↔ available rooms | ✅ RoomsTab (unassigned queue + room grid); minor filter gaps |
| §6 | Bulk assignment w/ capacity+gender+type validation | ✅ `assignGuests` (guestIds array) |
| §3 | Room CRUD, capacity guard | ✅ `upsertRoom` / `deleteRoom` |
| §25 | Audit log | ✅ `lib/audit.ts` wired through every room mutation |
| — | One-click auto-rooming + rooming-list print | ✅ `runAutoAssignment` / `getRoomingList` |

**Not yet built (the actual Phase 2 delta):**

| Spec | Requirement | Status |
|---|---|---|
| §3 | **Physical inventory import from Excel** (2,500 dorm beds, hostel blocks 1–4 & 7–8, WSL 24 rooms, GGL 35 rooms, EBPV 17 apartments × 4) | ❌ Rooms are hand-entered today |
| §8 | **Publishing** assignments; reps see own-hub rooms only after publish | ❌ No published flag; rep portal shows nothing |
| §9 | **Room change history** with required reason, preserved previous assignment | ❌ Moves delete the assignment row — history is destroyed |
| §7 | EBPV **apartment** semantics (assign to unit, max 4, occupants self-allocate) | ⚠️ Works by convention (room = apartment, capacity 4) but no apartment UI/copy |
| §2 | Four-role staff model (Super/Accommodation/Room-Assignment/Check-In), individual accounts, default location | ⚠️ Only platform roles admin + accommodation exist |
| §10–17 | Accommodation **check-in module** (search, check-in, duplicate prevention, wristband/keys, EBPV key recipient, unassigned referral) | ❌ Not built — current `/admin/desk-checkin` is a *POA payment* desk, different module |
| §15 | Key management ledger (WSL / GGL / EBPV; issued/replaced/returned) | ❌ |
| §18 | Payment override at check-in, Accommodation Admin only | ❌ |
| §19 | Offline check-in, designated station per building, sync queue | ❌ |
| §20 | Optional check-out | ❌ |
| §21–23 | Three dashboards | ❌ |
| §24 | Operational reports (xlsx **and PDF**) filtered per location/room/hub/gender/status | ⚠️ exceljs infra exists; report set + filters not built |

---

## 2. Sequencing (per §31 priority, adapted to what's already done)

- **Step A — done.** Room assignment engine, bulk + auto assign, POA desk, reconciliation export.
- **Step B — this plan.** Finish Priority 1: make room assignment *production-final* (import → assign → history → publish → rep visibility). Highest urgency: assignments begin "immediately" (§4) while check-in starts Nov 2, so everything in Step B is on the critical path before arrival day.
- **Step C — Priority 2.** Accommodation check-in (staff roles become mandatory here, so the 4-role model lands in Step C, not B).
- **Step D — Priority 3+4.** Offline syncInOut, dashboards, report exports down.

---

## 3. Step B scope — "Room assignment, complete"

### B1. Schema additions (`convex/schema.ts`)

```
agcRooms          + building: v.optional(v.string())          // block/quarter, e.g. "Blocks 1–4"
                  + publishedAt: v.optional(v.number())       // null = Unpublished
                  + publishedBy: v.optional(v.string())

agcRoomAssignments (append-only instead of delete-on-move)
                  + endedAt: v.optional(v.number())
                  + endReason: v.optional(v.string())
                  + replacedByAssignmentId: v.optional(v.id("agcRoomAssignments"))
```

Migration: existing rows stay open (`endedAt` undefined). Live occupancy =
assignments with `endedAt === undefined`. Every reader in
`agcRoomAssignments.ts` (listRoomsAdmin, assertAssignable, runAutoAssignment,
getRoomingList, and POA consumer logic) and `agcExcel` requires the same
one-line filter. History readers get "all rows", giving §9 for free.

### B2. Excel inventory import (§3)

- Template generation + an `importRooms` action under `convex/agcRoomAssignments.ts`
  using the existing `exceljs` pipeline (`agcExcel.ts` conventions).
- Columns: `Location (accommodationType) | Building/Block | Room/Apartment | Capacity | Gender designation`.
- Import behavior: preview action first (dry-run counts per location, e.g.
  "Mighty Fortress: 2,500 beds in 6 rooms"), then commit mutation.
- Row semantics: many beds in one room = **one row with capacity N**
  (unnumbered-bed model already supported); WSL/GGL = 1 row per numbered room;
  EBPV = 17 rows "Apartment 1..17", capacity 4, gender empty (mixed allowed, §7).
- Guards: import must not exceed the Phase 1 corrected inventory pools for the
  type (§3 note); duplicate room name within a location rejected (matches
  `upsertRoom`); never shrinks an existing occupied room — imported rows update
  capacity/notes for same-named rooms instead of duplicating.
- Gender defaults (§4): dormitory/hostel rooms import with gender lock from the
  sheet column; WSL/GGL/EBPV ignore it (mixed permitted).

### B3. Room change with reason + history (§9)

- New `changeRoom` mutation: guest, destination room, required `reason`.
- Validates destination capacity + gender + type (reuses `assertAssignable`),
  then closes the current assignment row (`endedAt/endReason`) and inserts the
  new one with `replacedByAssignmentId` linkage — no delete anywhere in the
  move path. Updates `assignGuests`'s move branch to route through this.
- If the guest is already checked in (Step C concern, but design now): the
  assignment swap inherently avoids a second check-in because check-in state
  will live on the guest, not the assignment row.
- Audit: `agc_room.changed` with from→to and reason in metadata.
- New query `getRoomChangeHistory(guestId)` + a per-room "History" drawer in RoomsTab.

### B4. Publishing (§8)

- `publishRooms(roomIds[] | {building, accommodationType})` and `unpublishRooms`
  — admin + accommodation roles only; audit `agc_room.published`.
- RoomsTab gets publish actions: per room, multi-select, and "publish block".
- Unpublished rooms are hidden from reps but ordinary for staff.
- Rep visibility: new portal query scoped by session rep → hub → that hub's
  bookings → assignments, **only for rooms with `publishedAt != null`**, showing
  building/room + occupants of that booking. Card goes into the existing
  `RepAccommodationTab` (accommodation tab already exists) behind the published
  gate. §8 says delegates aren't notified in advance — no email, view only.
- Hub isolation: reps must never resolve another hub's assignments (reuse the
  existing rep-session pattern; reuses scope-by-hubId rule).

### B5. EBPV apartment presentation (§7)

- Zero new tables: EBPV rooms *are* apartment units (capacity 4). After B2's
  import there will be exactly 17.
- RoomsTab: when `accommodationType === "ebpv"`, render capacity labels as
  "4 delegates", hide per-bed naming, and the room drawer shows
  "Apartment: capacity 4 · assigned/remaining · key recipient (filled in Step C)".
- Validation already caps the unit at 4 via capacity; add the copy change +
  assert EBPV rooms always have gender null.

### B6. Assignment-screen filter completion (§5)

- Unassigned queue filters: hub, gender, accommodation type, booking ref, with
  the multi-select bulk path pointing at any room of the matching type.

### Explicitly deferred to Step C (do not build in B)

Staff role accounts + default location (§2) — needed only at check-in;
check-in module, keys, override, duplicate prevention; offline (§19);
dashboards (§21–23); PDF export (§24 — xlsx for reports above only).

---

## 4. Deliverables checklist

- Schema + migrations as in B1; `npx tsc -p convex/tsconfig.json` clean.
- `importRooms` preview/commit actions + Excel template (columns per §3).
- `changeRoom`, `publishRooms`, `unpublishRooms`, history queries.
- Rep portal published-assignment card, hub-scoped, publish-gated.
- RoomsTab: import UI, publish controls, reason prompt, history drawer, EBPV copy.
- Tests (convex-test): import capacity guard; change preserves history & drops
  occupancy in old room; publish gate — rep sees own hub only, and nothing when
  unpublished; bulk assign into imported block respects capacity+gender;
  EBPV 5th assignment rejected.
- Gates: `tsc`, convex tsc, eslint, vitest, `npm run build`, deploy Convex + Vercel.

## 5. Acceptance (maps to §30 "Room Assignment" block)

Excel import lands the full §3 inventory; individual and bulk assigns work on
it; gender + capacity cannot be exceeded; EBPV capped at 4/unit; publishing
individually and by block; room changes preserve history with reason; reps see
only their own hub's published assignments; Phase 1 flows untouched
(148-test suite stays green).

## 6. Risks / decisions to confirm

1. **2,500-bed dorm import**: one row ("Mighty Fortress", capacity 2,500) vs
   several per-quarter rows — recommend splitting by floor/wing for readable
   rooming lists; confirm with accommodation admin. Physical layout, so ask
   whoever owns the Excel before import day.
2. **Rep visibility timing**: §8 implies reps see assignments only for their
   delegates — the rooming question "who shares my room?" only matters for
   dorms/hostels; showing co-occupants of a published room within their own
   hub's bookings is safe, full room cohort list is a product call — default:
   show only own-hub delegates per room.
3. **history volume**: assignments become append-only; purge policy can follow
   POA's 30-day pattern later — no action in B.
