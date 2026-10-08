import { describe, expect, it } from "vitest";
import { recoverRacesAtBoot } from "./boot-recovery";

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(outcomes: ReadonlyArray<readonly string[] | Error>) {
  const scheduled: { callback: () => void; delayMs: number }[] = [];
  const recovered: string[] = [];
  const logs: string[] = [];
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
    onRecovered: (lobbyId) => recovered.push(lobbyId),
    schedule: (callback, delayMs) => scheduled.push({ callback, delayMs }),
    log: (message) => logs.push(message),
  });
  return {
    scheduled,
    recovered,
    logs,
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

describe("recoverRacesAtBoot", () => {
  it("recovers once and tells each recovered room", async () => {
    const run = harness([["lobby-1", "lobby-2"]]);
    await settled();
    expect(run.calls).toBe(1);
    expect(run.recovered).toEqual(["lobby-1", "lobby-2"]);
    expect(run.scheduled).toEqual([]);
  });

  it("retries a few times while the database does not answer, then gives up", async () => {
    const unreachable = new Error("connect ECONNREFUSED");
    const run = harness([unreachable, unreachable, unreachable, unreachable]);
    await settled();
    expect(run.scheduled.map((retry) => retry.delayMs)).toEqual([5_000]);
    await run.retry();
    await run.retry();
    await run.retry();
    expect(run.calls).toBe(4);
    expect(run.scheduled).toEqual([]);
    expect(run.logs.at(-1)).toContain("giving up");
    // No query parameter or message from the database: only its shape.
    expect(run.logs.join("\n")).not.toContain("undefined");
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    const run = harness([new Error("connect ECONNREFUSED"), ["lobby-1"]]);
    await settled();
    await run.retry();
    expect(run.recovered).toEqual(["lobby-1"]);
    expect(run.scheduled).toEqual([]);
  });
});
