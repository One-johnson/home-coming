import { describe, expect, it } from "vitest";

import { roomingListHtml, type RoomingListDoc } from "@/lib/agcRoomingList";

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

describe("roomingListHtml", () => {
  it("prints the rooms, not the console chrome", () => {
    const html = roomingListHtml(doc());
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Rooming list");
    expect(html).toContain("747");
    expect(html).toContain("A12");
    expect(html).not.toContain("data-radix");
    expect(html).not.toContain("sm:max-w-3xl");
  });

  it("prints every bed, including vacancies, so the count can be checked", () => {
    const html = roomingListHtml(doc());
    // 747 holds one delegate in four beds; A12 is empty.
    expect(html.split("(vacant)").length - 1).toBe(5);
    expect(html).toContain("3 vacant");
  });

  it("totals rooms, beds, filled and vacant", () => {
    const html = roomingListHtml(doc());
    expect(html).toContain("<strong>2</strong> room(s)");
    expect(html).toContain("<strong>6</strong> bed(s)");
    expect(html).toContain("<strong>1</strong> filled");
    expect(html).toContain("<strong>5</strong> vacant");
  });

  it("groups rooms under their accommodation type", () => {
    const html = roomingListHtml(doc());
    const hostel = html.indexOf(">Hostel <");
    const apartment = html.indexOf(">Apartment <");
    expect(hostel).toBeGreaterThan(-1);
    expect(apartment).toBeGreaterThan(-1);
    expect(hostel).toBeLessThan(apartment);
  });

  it("escapes names and shows the filter it was printed for", () => {
    const html = roomingListHtml(
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
    );
    expect(html).toContain("747 &lt;B&gt;");
    expect(html).toContain("A &amp; B &lt;script&gt;");
    expect(html).toContain("Accommodation: Hostel");
    expect(html).toContain("—</td>");
  });

  it("says so when the filter matches nothing", () => {
    const html = roomingListHtml(doc({ rooms: [] }));
    expect(html).toContain("No rooms match this filter.");
  });
});
