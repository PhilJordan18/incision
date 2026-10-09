import type { RaceOwnership } from "@incision/database";
import { describe, expect, it, vi } from "vitest";
import { getRaceRegistry, type OwnedRace, RaceRegistry } from "./race-registry";

function owned(lobbyId: string): OwnedRace & { readonly stopped: () => boolean } {
  let stopped = false;
  const ownership: RaceOwnership = { raceId: `race-${lobbyId}`, lobbyId, ownerId: "owner", ownerEpoch: 1 };
  return { ownership, lease: { stop: () => (stopped = true) }, stopped: () => stopped };
}

describe("RaceRegistry", () => {
  it("knows the races this process runs, one per room, and stops a lease when its race ends", () => {
    const registry = new RaceRegistry();
    const race = owned("lobby-1");
    expect(registry.add(race)).toBe(true);
    expect(registry.ownsRace("lobby-1")).toBe(true);
    expect(registry.ownsRace("lobby-2")).toBe(false);
    registry.remove("lobby-1");
    expect(registry.ownsRace("lobby-1")).toBe(false);
    expect(race.stopped()).toBe(true);
  });

  it("on stopping, refuses new races, interrupts its own ones and tells their rooms", async () => {
    const registry = new RaceRegistry();
    const [one, two, lost] = [owned("lobby-1"), owned("lobby-2"), owned("lobby-3")];
    registry.add(one);
    registry.add(two);
    registry.add(lost);
    const interrupt = vi.fn(async ({ lobbyId }: RaceOwnership) => lobbyId !== "lobby-3");
    const told: string[] = [];
    const outcome = await registry.stop({ interrupt, onInterrupted: (lobbyId) => told.push(lobbyId), timeoutMs: 1_000 });
    expect(outcome).toEqual({ interrupted: 2, left: 1, timedOut: false });
    expect(told.sort()).toEqual(["lobby-1", "lobby-2"]);
    // Every lease stops, interrupted or not: no renewal after the stop.
    expect([one, two, lost].every((race) => race.stopped())).toBe(true);
    expect(registry.add(owned("lobby-4"))).toBe(false);
    expect(registry.ownsRace("lobby-1")).toBe(false);
  });

  it("leaves a race to its lease when its interruption fails or does not answer in time", async () => {
    const registry = new RaceRegistry();
    registry.add(owned("lobby-1"));
    registry.add(owned("lobby-2"));
    const interrupt = vi.fn(async ({ lobbyId }: RaceOwnership) => {
      if (lobbyId === "lobby-1") {
        throw new Error("connect ECONNREFUSED");
      }
      return new Promise<boolean>(() => undefined);
    });
    const started = performance.now();
    const outcome = await registry.stop({ interrupt, onInterrupted: () => undefined, timeoutMs: 50 });
    expect(outcome).toEqual({ interrupted: 0, left: 2, timedOut: true });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("is one per process, shared by every bundled copy of the module", () => {
    expect(getRaceRegistry()).toBe(getRaceRegistry());
    expect((globalThis as typeof globalThis & { incisionRaceRegistry?: RaceRegistry }).incisionRaceRegistry).toBe(getRaceRegistry());
  });
});
