import { describe, expect, it } from "vitest";
import { admissionRefusal, localDisplayName, ROOM_PHASES } from "./room-admission";

describe("admissionRefusal", () => {
  it("admits only while waiting or at results (SALLE-09)", () => {
    const refusals = ROOM_PHASES.map((phase) => [phase, admissionRefusal({ phase, role: "spectator", activeParticipants: 0, capacity: 2 })]);
    expect(refusals).toEqual([
      ["waiting", undefined],
      ["countdown", "ROOM_NOT_ADMITTING"],
      ["racing", "ROOM_NOT_ADMITTING"],
      ["results", undefined],
      ["closed", "ROOM_NOT_ADMITTING"],
    ]);
  });

  it("keeps participants within capacity; spectators take no place (SALLE-05)", () => {
    expect(admissionRefusal({ phase: "waiting", role: "participant", activeParticipants: 1, capacity: 2 })).toBeUndefined();
    expect(admissionRefusal({ phase: "waiting", role: "participant", activeParticipants: 2, capacity: 2 })).toBe("ROOM_FULL");
    expect(admissionRefusal({ phase: "waiting", role: "spectator", activeParticipants: 2, capacity: 2 })).toBeUndefined();
  });
});

describe("localDisplayName", () => {
  it("keeps the account's name when nobody in the room uses it", () => {
    expect(localDisplayName("Bob", new Set(["alice"]))).toBe("Bob");
  });

  it("adds the first free number, compared like display names", () => {
    expect(localDisplayName("Bob", new Set(["bob", "bob 2"]))).toBe("Bob 3");
  });

  it("keeps 40 characters at most when it adds a suffix", () => {
    const long = "x".repeat(40);
    expect(localDisplayName(long, new Set([long]))).toBe(`${"x".repeat(38)} 2`);
  });
});
