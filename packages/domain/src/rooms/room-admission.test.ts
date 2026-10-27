import { describe, expect, it } from "vitest";
import { admissionRefusal, admitsNewMembers, localDisplayName, ROOM_PHASES } from "./room-admission";

describe("admitsNewMembers", () => {
  it("is true while waiting or at results only", () => {
    expect(ROOM_PHASES.filter(admitsNewMembers)).toEqual(["waiting", "results"]);
  });
});

describe("admissionRefusal", () => {
  it("admits only while waiting or at results (SALLE-09)", () => {
    const refusals = ROOM_PHASES.map((phase) => [phase, admissionRefusal({ phase, role: "spectator", activeSpectators: 0, activeParticipants: 0, capacity: 2 })]);
    expect(refusals).toEqual([
      ["waiting", undefined],
      ["countdown", "ROOM_NOT_ADMITTING"],
      ["racing", "ROOM_NOT_ADMITTING"],
      ["results", undefined],
      ["closed", "ROOM_NOT_ADMITTING"],
    ]);
  });

  it("keeps participants within capacity; spectators take no place (SALLE-05)", () => {
    expect(admissionRefusal({ phase: "waiting", role: "participant", activeSpectators: 0, activeParticipants: 1, capacity: 2 })).toBeUndefined();
    expect(admissionRefusal({ phase: "waiting", role: "participant", activeSpectators: 0, activeParticipants: 2, capacity: 2 })).toBe("ROOM_FULL");
    expect(admissionRefusal({ phase: "waiting", role: "spectator", activeSpectators: 0, activeParticipants: 2, capacity: 2 })).toBeUndefined();
  });
});

describe("D-22 spectator quota", () => {
  it.each(["waiting", "results"] as const)("admits 19 but refuses 20 or more active spectators in %s", (phase) => {
    for (const activeSpectators of [0, 19, 20, 21]) {
      expect(admissionRefusal({ phase, role: "spectator", activeParticipants: 30, activeSpectators, capacity: 30 }))
        .toBe(activeSpectators < 20 ? undefined : "SPECTATORS_FULL");
    }
  });
  it("does not consume participant slots or override a phase refusal", () => {
    expect(admissionRefusal({ phase: "waiting", role: "participant", activeParticipants: 1, activeSpectators: 20, capacity: 2 })).toBeUndefined();
    for (const phase of ["countdown", "racing", "closed"] as const) {
      expect(admissionRefusal({ phase, role: "spectator", activeParticipants: 2, activeSpectators: 20, capacity: 2 })).toBe("ROOM_NOT_ADMITTING");
    }
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
