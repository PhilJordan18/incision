import { describe, expect, it } from "vitest";
import { acceptsRoomCode, capacityRefusal, isPublicRoom, ROOM_VISIBILITIES } from "./room-access";

describe("room capacity (SALLE-05, CONF-11)", () => {
  it.each([Number.NaN, Infinity, -Infinity, -1, 0, 1, 2.5, 30.1, 31])("refuses invalid capacity %s", (capacity) => {
    expect(capacityRefusal({ capacity, activeParticipants: 0 })).toBe("INVALID_CAPACITY");
  });

  it("accepts every integer capacity from two through thirty", () => {
    for (let capacity = 2; capacity <= 30; capacity += 1) {
      expect(capacityRefusal({ capacity, activeParticipants: 0 })).toBeUndefined();
      expect(capacityRefusal({ capacity, activeParticipants: capacity })).toBeUndefined();
      expect(capacityRefusal({ capacity, activeParticipants: capacity + 1 })).toBe("CAPACITY_BELOW_OCCUPANCY");
    }
  });

  it("does not permit a reduction below humans and bots already present", () => {
    const humanParticipants = 2;
    const botParticipants = 3;
    expect(capacityRefusal({ capacity: 4, activeParticipants: humanParticipants + botParticipants }))
      .toBe("CAPACITY_BELOW_OCCUPANCY");
    expect(capacityRefusal({ capacity: 5, activeParticipants: humanParticipants + botParticipants })).toBeUndefined();
  });
});

describe("visibility policy (SALLE-03)", () => {
  it("allows code entry only for public and code-only rooms", () => {
    expect(ROOM_VISIBILITIES.filter(acceptsRoomCode)).toEqual(["public", "code"]);
  });

  it("exposes only public rooms for discovery", () => {
    expect(ROOM_VISIBILITIES.filter(isPublicRoom)).toEqual(["public"]);
  });
});
