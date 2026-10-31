import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { pdf, type DocumentProps } from "@react-pdf/renderer";

import { RoomingListDocument } from "@/components/admin/agc/RoomingListPdf";
import { roomingListModel, type RoomingListDoc } from "@/lib/agcRoomingList";

/**
 * The PDF is the deliverable, so check it actually renders: a document tree can
 * typecheck and still fail at render time (bad style key, unsupported prop).
 * This renders through the same `toBlob()` path the download uses.
 */
function doc(overrides: Partial<RoomingListDoc> = {}): RoomingListDoc {
  return {
    typeLabel: "All types",
    generatedAt: Date.parse("2026-10-30T09:00:00Z"),
    generatedBy: "desk@lci.org",
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
          {
            _id: "guest2",
            name: "Mrs Grace Adeyemi",
            gender: "female",
            hubName: "Lagos Hub",
            bookingRef: "",
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

async function renderBytes(list: RoomingListDoc): Promise<Uint8Array> {
  // pdf() types its argument as a Document element; a component element is
  // the same thing at runtime, so widen it for the call.
  const element = createElement(RoomingListDocument, {
    model: roomingListModel(list),
  }) as unknown as ReactElement<DocumentProps>;
  const blob = await pdf(element).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

describe("RoomingListDocument", () => {
  it("renders a real PDF for a mixed list with vacancies", async () => {
    const bytes = await renderBytes(doc());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
  }, 30_000);

  it("renders an empty list without failing", async () => {
    const bytes = await renderBytes(doc({ rooms: [] }));
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  }, 30_000);
});
