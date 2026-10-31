/**
 * Pure helper for the printable rooming list — the sheet the check-in desk
 * hands out. Kept free of React and Convex imports so it can be unit-tested and
 * dropped into a dedicated print window.
 *
 * The console renders the list as a dialog, and window.print() there printed
 * the whole Rooms screen with the dialog's own max-height scroll box clipped to
 * a page. This builds a standalone document instead: no app chrome, every room
 * on one continuous sheet, and vacancies spelled out so the bed count can be
 * ticked off by hand.
 */

export type RoomingListRoom = {
  _id: string;
  accommodationType: string;
  typeLabel: string;
  name: string;
  building: string | null;
  gender: string | null;
  capacity: number;
  occupants: Array<{
    _id: string;
    name: string;
    gender: string | null;
    hubName: string;
    bookingRef: string;
  }>;
};

export type RoomingListDoc = {
  rooms: RoomingListRoom[];
  /** What the sheet was filtered to, printed in the header so nothing is assumed. */
  typeLabel: string;
  generatedAt: number;
  generatedBy?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roomHeading(room: RoomingListRoom): string {
  const parts = [room.typeLabel];
  if (room.building) parts.push(room.building);
  if (room.gender) parts.push(`${room.gender} only`);
  parts.push(`${room.occupants.length}/${room.capacity} beds`);
  if (room.occupants.length < room.capacity) {
    const free = room.capacity - room.occupants.length;
    parts.push(`${free} vacant`);
  }
  return parts.join(" · ");
}

/**
 * Render the rooming list as a standalone printable HTML document. Rooms keep
 * the order the query returned (type, then room name), grouped under a type
 * heading so a desk can hand out one accommodation block at a time.
 */
export function roomingListHtml(doc: RoomingListDoc): string {
  const groups = new Map<string, RoomingListRoom[]>();
  for (const room of doc.rooms) {
    const key = room.typeLabel || room.accommodationType;
    const group = groups.get(key);
    if (group) group.push(room);
    else groups.set(key, [room]);
  }

  const beds = doc.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const taken = doc.rooms.reduce((sum, room) => sum + room.occupants.length, 0);
  const vacant = Math.max(0, beds - taken);

  const sections = Array.from(groups.entries())
    .map(([label, rooms]) => {
      const roomsHtml = rooms
        .map((room) => {
          const rows = room.occupants
            .map(
              (guest, index) => `<tr>
            <td class="bed">${index + 1}</td>
            <td>${escapeHtml(guest.name)}</td>
            <td>${escapeHtml(guest.hubName)}</td>
            <td class="ref">${guest.bookingRef ? escapeHtml(guest.bookingRef) : "—"}</td>
            <td class="tick"></td>
          </tr>`,
            )
            .join("");
          const vacancies = Array.from({
            length: Math.max(0, room.capacity - room.occupants.length),
          })
            .map(
              (_, index) => `<tr class="vacant">
            <td class="bed">${room.occupants.length + index + 1}</td>
            <td colspan="3"><em>(vacant)</em></td>
            <td class="tick"></td>
          </tr>`,
            )
            .join("");

          return `<div class="room">
        <p class="room-name">${escapeHtml(room.name)} <span class="room-meta">${escapeHtml(roomHeading(room))}</span></p>
        <table>
          <thead>
            <tr><th class="bed">Bed</th><th>Guest</th><th>Hub</th><th class="ref">Booking ref</th><th class="tick">Arrived</th></tr>
          </thead>
          <tbody>${rows}${vacancies}</tbody>
        </table>
      </div>`;
        })
        .join("");

      return `<section>
      <h2>${escapeHtml(label)} <span class="count">${rooms.length} room(s)</span></h2>
      ${roomsHtml}
    </section>`;
    })
    .join("");

  const empty = `<p class="empty">No rooms match this filter.</p>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Rooming list — ${escapeHtml(doc.typeLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 24px 28px 32px; color: #111827; }
  header { border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: 0.02em; }
  .muted { color: #4b5563; font-size: 11px; margin: 2px 0 0; }
  .totals { margin-top: 6px; font-size: 11px; }
  .totals span { display: inline-block; margin-right: 14px; }
  section { margin-bottom: 14px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d1d5db; }
  .count { font-weight: 400; text-transform: none; letter-spacing: 0; color: #6b7280; }
  .room { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px; }
  .room-name { font-size: 12px; font-weight: 600; margin: 0 0 3px; }
  .room-meta { font-weight: 400; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 3px 6px; border-bottom: 1px solid #9ca3af; }
  td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
  .bed { width: 32px; text-align: center; color: #6b7280; }
  .ref { width: 110px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .tick { width: 54px; }
  tr.vacant td { color: #6b7280; }
  .empty { font-size: 12px; color: #4b5563; }
  footer { margin-top: 18px; font-size: 9px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 6px; }
  @page { margin: 12mm; }
  @media print { body { margin: 0; } thead { display: table-header-group; } }
</style>
</head>
<body>
  <header>
    <h1>Rooming list — Attempt Great Things Conference 2026</h1>
    <p class="muted">
      Accommodation: ${escapeHtml(doc.typeLabel)} · Generated
      ${new Date(doc.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      ${doc.generatedBy ? `· by ${escapeHtml(doc.generatedBy)}` : ""}
    </p>
    <p class="totals">
      <span><strong>${doc.rooms.length}</strong> room(s)</span>
      <span><strong>${beds}</strong> bed(s)</span>
      <span><strong>${taken}</strong> filled</span>
      <span><strong>${vacant}</strong> vacant</span>
    </p>
  </header>
  ${doc.rooms.length === 0 ? empty : sections}
  <footer>
    Vacant beds print as vacancies so the bed count can be ticked off by hand. Tick “Arrived” as
    each delegate collects their key. Lighthouse Chapel International — Attempt Great Things
    Conference 2026 · Generated from the accommodation console.
  </footer>
</body>
</html>`;
}
