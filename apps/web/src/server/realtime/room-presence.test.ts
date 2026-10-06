import { describe, expect, it } from "vitest";
import { RoomPresence } from "./room-presence";

describe("RoomPresence", () => {
  it("counts a member online from its first socket until its last one closes", () => {
    const presence = new RoomPresence();
    expect(presence.add("room", "m1", "s1")).toBe(true);
    expect(presence.add("room", "m1", "s2")).toBe(false);
    expect(presence.onlineMembers("room")).toEqual(new Set(["m1"]));
    expect(presence.remove("room", "m1", "s1")).toBe(false);
    expect(presence.remove("room", "m1", "s2")).toBe(true);
    expect(presence.onlineMembers("room")).toEqual(new Set());
    expect(presence.remove("room", "m1", "s2")).toBe(false);
  });
});
