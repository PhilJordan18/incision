import type { Recovery } from "@incision/database";
import { describe, expect, it } from "vitest";
import { BOOT_RECOVERY_RETRY_DELAYS_MS, recoverRacesAtBoot } from "./boot-recovery";

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(outcomes: ReadonlyArray<Recovery | Error>, onRecovered: (lobbyId: string) => void = () => undefined) {
  const scheduled: { callback: () => void; delayMs: number }[] = [];
  const delays: number[] = [];
  const recovered: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  let calls = 0;
  recoverRacesAtBoot({
    recover: async () => {
      const outcome = outcomes[calls] ?? new Error("no more outcomes");
      calls += 1;
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
    onRecovered: (lobbyId) => {
      recovered.push(lobbyId);
      onRecovered(lobbyId);
    },
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      delays.push(delayMs);
    },
    log: (message) => logs.push(message),
    logError: (message) => errors.push(message),
  });
  return {
    scheduled,
    delays,
    recovered,
    logs,
    errors,
    get calls() {
      return calls;
    },
    /** Runs the next scheduled retry. */
    async retry() {
      scheduled.shift()?.callback();
      await settled();
    },
  };
}

/** Shaped like Drizzle's wrapper around a PostgreSQL error: its message quotes the parameters. */
function failedQuery(): Error {
  const cause = Object.assign(new Error('relation "races" does not exist'), { code: "42P01", severity: "ERROR" });
  return Object.assign(new Error("Failed query: update races set ... params: secret-parameter"), {
    query: "update races set ...",
    params: ["secret-parameter"],
    cause,
  });
}

const nothing: Recovery = { rooms: [], orphans: 0, remaining: 0 };

describe("recoverRacesAtBoot", () => {
  it("recovers once, tells each recovered room and logs what it did", async () => {
    const run = harness([{ rooms: ["lobby-1", "lobby-2"], orphans: 1, remaining: 0 }]);
    await settled();
    expect(run.calls).toBe(1);
    expect(run.recovered).toEqual(["lobby-1", "lobby-2"]);
    expect(run.scheduled).toEqual([]);
    expect(run.logs).toEqual(["[races] boot recovery: 2 race(s) interrupted in their room, 1 no longer current in their room, 0 left for later"]);
    expect(run.errors).toEqual([]);
  });

  it("logs one line even when there is nothing to recover, so a deployment shows it ran", async () => {
    const run = harness([nothing]);
    await settled();
    expect(run.logs).toEqual(["[races] boot recovery: 0 race(s) interrupted in their room, 0 no longer current in their room, 0 left for later"]);
    expect(run.scheduled).toEqual([]);
  });

  it("retries a few times while the database does not answer, then gives up", async () => {
    const run = harness([failedQuery(), failedQuery(), failedQuery(), failedQuery()]);
    await settled();
    await run.retry();
    await run.retry();
    await run.retry();
    expect(run.calls).toBe(4);
    expect(run.delays).toEqual([...BOOT_RECOVERY_RETRY_DELAYS_MS]);
    expect(run.delays).toEqual([5_000, 15_000, 45_000]);
    expect(run.scheduled).toEqual([]);
    expect(run.errors).toHaveLength(4);
    expect(run.errors.at(0)).toBe("[races] boot recovery failed: 42P01, retrying");
    expect(run.errors.at(-1)).toBe("[races] boot recovery failed: 42P01, giving up");
    // Only the error's code: never the query's parameters nor the server's message.
    expect(run.errors.join("\n")).not.toMatch(/secret-parameter|does not exist/);
    expect(run.logs).toEqual([]);
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    const run = harness([new Error("connect ECONNREFUSED"), { rooms: ["lobby-1"], orphans: 0, remaining: 0 }]);
    await settled();
    await run.retry();
    expect(run.recovered).toEqual(["lobby-1"]);
    expect(run.scheduled).toEqual([]);
    expect(run.errors).toEqual(["[races] boot recovery failed: connect ECONNREFUSED, retrying"]);
  });

  it("tries again while races are left for later, then stops", async () => {
    const busy: Recovery = { rooms: [], orphans: 0, remaining: 1 };
    const run = harness([busy, busy, { rooms: ["lobby-1"], orphans: 0, remaining: 0 }]);
    await settled();
    expect(run.logs.at(-1)).toBe("[races] boot recovery: 0 race(s) interrupted in their room, 0 no longer current in their room, 1 left for later, retrying");
    await run.retry();
    await run.retry();
    expect(run.recovered).toEqual(["lobby-1"]);
    expect(run.scheduled).toEqual([]);

    const stuck = harness([busy, busy, busy, busy]);
    await settled();
    await stuck.retry();
    await stuck.retry();
    await stuck.retry();
    expect(stuck.calls).toBe(4);
    expect(stuck.scheduled).toEqual([]);
    expect(stuck.logs.at(-1)).toContain("1 left for later, giving up");
  });

  it("never lets a failing listener become an unhandled rejection", async () => {
    const run = harness([{ rooms: ["lobby-1"], orphans: 0, remaining: 0 }], () => {
      throw new TypeError("broadcast failed");
    });
    await settled();
    expect(run.errors).toEqual(["[races] boot recovery listener failed: TypeError"]);
  });
});
