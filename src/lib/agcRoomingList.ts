/**
 * Pure model for the rooming list PDF — the sheet the check-in desk hands out.
 *
 * Kept free of React and Convex imports so the grouping, bed rows, totals and
 * file name can be unit-tested without rendering a PDF. The PDF document itself
 * lives in `src/components/admin/agc/RoomingListPdf.tsx` and only lays this out.
 *
 * The console dialog shows the same data, but the download has to stand alone:
 * no app chrome, one room per block, vacancies spelled out so the desk can
 * tick beds off by hand, and rooms that never split across a page break.
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
  /** What the list was filtered to, printed in the header so nothing is assumed. */
  typeLabel: string;
  generatedAt: number;
  generatedBy?: string | null;
};

/** One printed line: either a delegate in a bed, or the bed standing empty. */
export type RoomingListBed =
  | { kind: "guest"; bed: number; name: string; hubName: string; bookingRef: string }
  | { kind: "vacant"; bed: number };

export type RoomingListRoomView = {
  id: string;
  name: string;
  /** Type, block, gender lock and bed count, e.g. `Hostel · Block 3 · 1/4 beds · 3 vacant`. */
  heading: string;
  capacity: number;
  filled: number;
  beds: RoomingListBed[];
};

export type RoomingListGroup = {
  label: string;
  rooms: RoomingListRoomView[];
};

export type RoomingListModel = {
  filterLabel: string;
  generatedAt: number;
  generatedLabel: string;
  generatedBy: string | null;
  groups: RoomingListGroup[];
  totals: { rooms: number; beds: number; filled: number; vacant: number };
  isEmpty: boolean;
  fileName: string;
};

/** `Hostel · Block 3 · female only · 1/4 beds · 3 vacant` */
export function roomingListRoomHeading(room: RoomingListRoom): string {
  const parts: string[] = [];
  if (room.typeLabel) parts.push(room.typeLabel);
  if (room.building) parts.push(room.building);
  if (room.gender) parts.push(`${room.gender} only`);
  parts.push(`${room.occupants.length}/${room.capacity} beds`);
  if (room.occupants.length < room.capacity) {
    parts.push(`${room.capacity - room.occupants.length} vacant`);
  }
  return parts.join(" · ");
}

function roomBeds(room: RoomingListRoom): RoomingListBed[] {
  const beds: RoomingListBed[] = room.occupants.map((guest, index) => ({
    kind: "guest",
    bed: index + 1,
    name: guest.name,
    hubName: guest.hubName,
    bookingRef: guest.bookingRef,
  }));
  for (let bed = room.occupants.length + 1; bed <= room.capacity; bed += 1) {
    beds.push({ kind: "vacant", bed });
  }
  return beds;
}

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "all-types";
}

/** `rooming-list-hostel-2026-10-31.pdf` */
export function roomingListFileName(doc: RoomingListDoc): string {
  const stamp = new Date(doc.generatedAt);
  const day = [
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
  ].join("-");
  return `rooming-list-${slug(doc.typeLabel || "all types")}-${day}.pdf`;
}

/**
 * Group the rooms under their accommodation type, keeping the order the query
 * returned (type, then room name) so the sheet matches the console.
 */
export function roomingListModel(doc: RoomingListDoc): RoomingListModel {
  const grouped = new Map<string, RoomingListRoomView[]>();
  for (const room of doc.rooms) {
    const label = room.typeLabel || room.accommodationType || "Unassigned";
    const view: RoomingListRoomView = {
      id: room._id,
      name: room.name,
      heading: roomingListRoomHeading(room),
      capacity: room.capacity,
      filled: room.occupants.length,
      beds: roomBeds(room),
    };
    const rooms = grouped.get(label);
    if (rooms) rooms.push(view);
    else grouped.set(label, [view]);
  }

  const beds = doc.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const filled = doc.rooms.reduce((sum, room) => sum + room.occupants.length, 0);

  return {
    filterLabel: doc.typeLabel || "All types",
    generatedAt: doc.generatedAt,
    generatedLabel: new Date(doc.generatedAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    generatedBy: doc.generatedBy ?? null,
    groups: Array.from(grouped.entries()).map(([label, rooms]) => ({ label, rooms })),
    totals: {
      rooms: doc.rooms.length,
      beds,
      filled,
      vacant: Math.max(0, beds - filled),
    },
    isEmpty: doc.rooms.length === 0,
    fileName: roomingListFileName(doc),
  };
}
