import type { RaceOwnership } from "@incision/database";
import { describe, expect, it } from "vitest";
import { type OwnedRace, RaceRegistry, type ShutdownOutcome } from "./race-registry";

function owned(lobbyId: string, shutdown: () => Promise<ShutdownOutcome> = async () => "interrupted", raceId = `race-${lobbyId}`) {
  let stopped = false;
  const ownership: RaceOwnership = { raceId, lobbyId, ownerId: "owner", ownerEpoch: 1 };
  let retired = false;
  const race: OwnedRace = {
    ownership,
    lease: { stop: () => (stopped = true) },
    retire: () => {
      retired = true;
      stopped = true;
    },
    shutdown,
  };
  return { race, stopped: () => stopped, retired: () => retired };
}

describe("RaceRegistry", () => {
  it("knows the race each room runs here, and stops its lease when that race ends", () => {
    const registry = new RaceRegistry();
    const one = owned("lobby-1");
    expect(registry.add(one.race)).toBe(true);
    expect(registry.ownsRace("lobby-1")).toBe(true);
    expect(registry.ownsRace("lobby-2")).toBe(false);
    // Removing another race of the room changes nothing.
    registry.remove({ lobbyId: "lobby-1", raceId: "race-older" });
    expect(registry.ownsRace("lobby-1")).toBe(true);
    registry.remove(one.race.ownership);
    expect(registry.ownsRace("lobby-1")).toBe(false);
    expect(one.stopped()).toBe(true);
  });

  it("replaces a stale race of the room with the new one, and retires the stale one", () => {
    const registry = new RaceRegistry();
    const stale = owned("lobby-1");
    registry.add(stale.race);
    const fresh = owned("lobby-1", undefined, "race-new");
    expect(registry.add(fresh.race)).toBe(true);
    expect(stale.retired()).toBe(true);
    expect(fresh.stopped()).toBe(false);
    registry.remove(stale.race.ownership);
    expect(registry.ownsRace("lobby-1")).toBe(true);
  });

  it("on stopping, refuses new races and ends each one through its own shutdown", async () => {
    const registry = new RaceRegistry();
    const races = [owned("lobby-1", async () => "finalised"), owned("lobby-2", async () => "interrupted"), owned("lobby-3", async () => "left")];
    for (const { race } of races) {
      registry.add(race);
    }
    const ended: [string, string][] = [];
    const report = await registry.stop({ onEnded: (lobbyId, outcome) => ended.push([lobbyId, outcome]), timeoutMs: 1_000 });
    expect(report).toEqual({ finalised: 1, interrupted: 1, left: 1, timedOut: false });
    expect(ended.sort()).toEqual([
      ["lobby-1", "finalised"],
      ["lobby-2", "interrupted"],
    ]);
    expect(races.every(({ stopped }) => stopped())).toBe(true);
    expect(registry.add(owned("lobby-4").race)).toBe(false);
  });

  it("keeps a race registered until its shutdown settles, so it is never recovered here meanwhile", async () => {
    const registry = new RaceRegistry();
    const finish = Promise.withResolvers<ShutdownOutcome>();
    registry.add(owned("lobby-1", () => finish.promise).race);
    const stopping = registry.stop({ onEnded: () => undefined, timeoutMs: 1_000 });
    expect(registry.ownsRace("lobby-1")).toBe(true);
    finish.resolve("interrupted");
    await stopping;
    expect(registry.ownsRace("lobby-1")).toBe(false);
  });

  it("leaves a race to its lease when its shutdown fails or does not answer in time", async () => {
    const registry = new RaceRegistry();
    registry.add(
      owned("lobby-1", async () => {
        throw new Error("connect ECONNREFUSED");
      }).race,
    );
    const hanging = owned("lobby-2", () => new Promise<ShutdownOutcome>(() => undefined));
    registry.add(hanging.race);
    const started = performance.now();
    const report = await registry.stop({ onEnded: () => undefined, timeoutMs: 50 });
    expect(report).toEqual({ finalised: 0, interrupted: 0, left: 2, timedOut: true });
    expect(performance.now() - started).toBeLessThan(1_000);
    // Still registered, so never recovered here, but no longer renewed.
    expect(registry.ownsRace("lobby-2")).toBe(true);
    expect(hanging.stopped()).toBe(true);
  });

});
