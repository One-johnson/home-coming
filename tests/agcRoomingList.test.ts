import { describe, expect, it } from "vitest";

import { roomingListFileName, roomingListModel, type RoomingListDoc } from "@/lib/agcRoomingList";

function doc(overrides: Partial<RoomingListDoc> = {}): RoomingListDoc {
  return {
    typeLabel: "All types",
    generatedAt: Date.parse("2026-10-30T09:00:00Z"),
    rooms: [
      {
        _id: "room1",
        accommodationType: "hostel",
        typeLabel: "Hostel",
        name: "747",
        building: "Block 3",
        gender: "female",
        capacity: 4,
        occupants: [
          {
            _id: "guest1",
            name: "Mrs Susan Ounangare",
            gender: "female",
            hubName: "Accra Hub",
            bookingRef: "HC12345",
          },
        ],
      },
      {
        _id: "room2",
        accommodationType: "apartment",
        typeLabel: "Apartment",
        name: "A12",
        building: null,
        gender: null,
        capacity: 2,
        occupants: [],
      },
    ],
    ...overrides,
  };
}

describe("roomingListModel", () => {
  it("carries the rooms and the filter it was downloaded for", () => {
    const model = roomingListModel(doc());
    expect(model.filterLabel).toBe("All types");
    expect(model.generatedBy).toBeNull();
    expect(model.generatedLabel).not.toBe("");
    expect(model.isEmpty).toBe(false);
    expect(model.groups.flatMap((group) => group.rooms.map((room) => room.name))).toEqual([
      "747",
      "A12",
    ]);
  });

  it("prints every bed, including vacancies, so the count can be checked", () => {
    const model = roomingListModel(doc());
    // 747 holds one delegate in four beds; A12 is empty.
    const hostel = model.groups[0].rooms[0];
    expect(hostel.beds).toHaveLength(4);
    expect(hostel.beds.map((bed) => bed.bed)).toEqual([1, 2, 3, 4]);
    expect(hostel.beds.filter((bed) => bed.kind === "vacant")).toHaveLength(3);

    const vacantRows = model.groups
      .flatMap((group) => group.rooms)
      .flatMap((room) => room.beds)
      .filter((bed) => bed.kind === "vacant");
    expect(vacantRows).toHaveLength(5);
  });

  it("totals rooms, beds, filled and vacant", () => {
    expect(roomingListModel(doc()).totals).toEqual({
      rooms: 2,
      beds: 6,
      filled: 1,
      vacant: 5,
    });
  });

  it("groups rooms under their accommodation type, in query order", () => {
    const model = roomingListModel(doc());
    expect(model.groups.map((group) => group.label)).toEqual(["Hostel", "Apartment"]);
    expect(model.groups[0].rooms[0].heading).toBe(
      "Hostel · Block 3 · female only · 1/4 beds · 3 vacant",
    );
    expect(model.groups[1].rooms[0].heading).toBe("Apartment · 0/2 beds · 2 vacant");
  });

  it("keeps guest details verbatim for the PDF to lay out", () => {
    const guest = roomingListModel(
      doc({
        typeLabel: "Hostel",
        rooms: [
          {
            _id: "room1",
            accommodationType: "hostel",
            typeLabel: "Hostel",
            name: "747 <B>",
            building: null,
            gender: null,
            capacity: 1,
            occupants: [
              {
                _id: "guest1",
                name: "A & B <script>",
                gender: null,
                hubName: "Hub",
                bookingRef: "",
              },
            ],
          },
        ],
      }),
    ).groups[0].rooms[0].beds[0];
    expect(guest).toEqual({
      kind: "guest",
      bed: 1,
      name: "A & B <script>",
      hubName: "Hub",
      bookingRef: "",
    });
  });

  it("names the download after the filter and the day", () => {
    expect(roomingListFileName(doc({ typeLabel: "Hostel" }))).toMatch(
      /^rooming-list-hostel-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(roomingListFileName(doc({ typeLabel: "" }))).toMatch(
      /^rooming-list-all-types-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    // A single room names the file after the room, not the filter.
    const singleRoom = roomingListFileName(doc({ fileNameLabel: "747" }));
    expect(singleRoom.startsWith("rooming-list-747-")).toBe(true);
    expect(singleRoom.endsWith(".pdf")).toBe(true);
  });

  it("says so when the filter matches nothing", () => {
    const model = roomingListModel(doc({ rooms: [] }));
    expect(model.isEmpty).toBe(true);
    expect(model.groups).toEqual([]);
    expect(model.totals).toEqual({ rooms: 0, beds: 0, filled: 0, vacant: 0 });
  });
});
