import { describe, expect, test } from "vitest";
import { parsePublishScope, publishScopeLabel } from "@/lib/agcRoomPublish";

const label = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

describe("parsePublishScope", () => {
  test("reads both directions of the all-rooms scope", () => {
    expect(parsePublishScope("publish:all")).toEqual({ publish: true, all: true });
    expect(parsePublishScope("unpublish:all")).toEqual({
      publish: false,
      all: true,
    });
  });

  test("carries the direction through a type scope", () => {
    expect(parsePublishScope("unpublish:type:hostel")).toEqual({
      publish: false,
      accommodationType: "hostel",
    });
    expect(parsePublishScope("publish:type:wise_serpents")).toEqual({
      publish: true,
      accommodationType: "wise_serpents",
    });
  });

  test("keeps a building name that contains a colon", () => {
    expect(parsePublishScope("unpublish:building:Block A: North")).toEqual({
      publish: false,
      building: "Block A: North",
    });
  });

  test("refuses scopes that are not a direction plus a target", () => {
    for (const value of ["", "all", "type:hostel", "building:X", "publish:", "publish:type:", "unpublish:building:  "]) {
      expect(parsePublishScope(value)).toBeNull();
    }
  });
});

describe("publishScopeLabel", () => {
  test("says which direction and which rooms", () => {
    expect(publishScopeLabel({ publish: true, all: true }, label)).toBe(
      "Publish all rooms",
    );
    expect(publishScopeLabel({ publish: false, all: true }, label)).toBe(
      "Unpublish all rooms",
    );
    expect(
      publishScopeLabel({ publish: false, accommodationType: "hostel" }, label),
    ).toBe("Unpublish all Hostel rooms");
    expect(publishScopeLabel({ publish: true, building: "Mighty Fortress" }, label)).toBe(
      "Publish block — Mighty Fortress",
    );
  });
});
