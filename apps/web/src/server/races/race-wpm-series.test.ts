import { describe, expect, it, vi } from "vitest";
import {
  asDuration, asEntrantId, asInstant, asRaceId, createBonusRace, computeMeasures,
  type StoredWpmSeries,
} from "@incision/domain";
import type { RaceResultRow } from "@incision/database";
import { RaceRuntime, type RaceConnection, type RaceStore } from "./race-runtime";
import type { LeaseState } from "./race-lease";

const START = 1_800_000_000_000;
const WON = { won: true, alreadyDone: false } as const;
const ownership = { raceId: "11111111-1111-4111-8111-111111111111", lobbyId: "room", ownerId: "owner", ownerEpoch: 1 };
const entrants = ["alice", "bob"].map((id) => ({ entrantId: id, accountId: id, displayName: id }));

async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

function setup(options: { limit?: number | null; text?: string; store?: Partial<RaceStore> } = {}) {
  let now = START;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const store = {
    beginRacing: vi.fn<RaceStore["beginRacing"]>(async () => WON),
    finalizeRace: vi.fn<RaceStore["finalizeRace"]>(options.store?.finalizeRace ?? (async () => WON)),
    interruptOwnRace: vi.fn<RaceStore["interruptOwnRace"]>(async () => WON),
  };
  const followers: RaceConnection[] = entrants.map(({ accountId }) => ({ id: accountId, accountId, emit: vi.fn() }));
  const lease = {
    state: "held" as LeaseState, start: vi.fn(), stop: vi.fn(),
    isAuthoritative: vi.fn(() => lease.state === "held"), suspendedForMs: () => undefined,
  };
  const made = createBonusRace({ enabled: false, random: [1, 2, 3, 4], race: {
    raceId: asRaceId(ownership.raceId), text: options.text ?? "ab", errorMode: "mandatory",
    timeLimit: options.limit === null ? null : asDuration(options.limit ?? 30_000), now: asInstant(START),
    participants: entrants.map(({ entrantId }) => ({ entrantId: asEntrantId(entrantId), kind: "human" })),
  } });
  if (!made.ok) throw new Error(made.reason);
  const runtime = new RaceRuntime({ ownership, entrants, state: made.state, language: "fr", store, lease,
    now: () => now, followers: () => followers, onSettled: vi.fn(), log: vi.fn(),
    schedule(callback, delay) {
      const key = id++;
      timers.set(key, { at: now + delay, callback });
      return () => void timers.delete(key);
    },
  });
  function type(index: number, text = "ab", seq = 1) {
    return runtime.keystrokes(followers[index]!, { raceId: ownership.raceId, seq, textVersion: 0,
      events: [...text].map((grapheme) => ({ type: "insert", grapheme })),
    });
  }
  async function advance(milliseconds: number) {
    const until = now + milliseconds;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      now = Math.max(now, due[1].at);
      timers.delete(due[0]); due[1].callback(); await settle();
    }
    now = until;
    await settle();
  }
  return { runtime, lease, followers, store, type, advance, timers,
    jump: (ms: number) => { now += ms; },
    async lateTimersNewestFirst() {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now).reverse();
      for (const [key, timer] of due) {
        if (!timers.delete(key)) continue;
        timer.callback(); await settle();
      }
    },
    rows: () => store.finalizeRace.mock.calls[0]?.[1] ?? [],
  };
}

function seriesOf(row: RaceResultRow | undefined): StoredWpmSeries {
  if (!row || "unavailable" in row.wpmSeries) throw new Error("Live result must have a series");
  return row.wpmSeries;
}

describe("runtime WPM collection and terminal freeze", () => {
  it("freezes cumulative expected-key errors, including corrected mistakes", async () => {
    const app = setup(); app.runtime.start(); await app.advance(4000);
    expect(app.type(0, "x")).toMatchObject({ ok: true });
    expect(app.runtime.keystrokes(app.followers[0]!, { raceId: ownership.raceId, seq: 2, textVersion: 0,
      events: [{ type: "deleteBackward" }, { type: "insert", grapheme: "a" }, { type: "insert", grapheme: "b" }],
    })).toMatchObject({ ok: true });
    app.type(1); await app.runtime.whenSaved();
    const alice = app.rows().find((row) => row.entrantId === "alice");
    const bob = app.rows().find((row) => row.entrantId === "bob");
    expect(alice?.keyErrors).toEqual({ version: 1, keys: [{ grapheme: "a", count: 1 }] });
    expect(bob?.keyErrors).toEqual({ version: 1, keys: [] });
    expect(Object.isFrozen(alice?.keyErrors)).toBe(true);
    expect(Object.isFrozen(alice?.keyErrors?.keys)).toBe(true);
    expect(Object.isFrozen(alice?.keyErrors?.keys[0])).toBe(true);
  });
  it("captures silence without reduction, lease checks, SQL or broadcast from the sample timer", async () => {
    const app = setup();
    app.runtime.start();
    await app.advance(3000);
    const revision = app.runtime.state.revision;
    const clock = app.runtime.state.clock;
    await app.advance(250); // flush progress independently
    const authorityCalls = app.lease.isAuthoritative.mock.calls.length;
    const emitted = app.followers.map((tab) => vi.mocked(tab.emit).mock.calls.length);
    await app.advance(1750);
    expect(app.runtime.state.revision).toBe(revision);
    expect(app.runtime.state.clock).toBe(clock);
    expect(app.lease.isAuthoritative).toHaveBeenCalledTimes(authorityCalls);
    expect(app.followers.map((tab) => vi.mocked(tab.emit).mock.calls.length)).toEqual(emitted);
    expect(app.store.beginRacing).toHaveBeenCalledOnce();
    expect(app.store.finalizeRace).not.toHaveBeenCalled();
    app.type(0); app.type(1);
    await app.runtime.whenSaved();
    expect(seriesOf(app.rows()[0]).points.map((point) => point.elapsed)).toEqual([0, 1000, 2000]);
    expect(app.timers.size).toBe(0);
  });

  it("freezes an early finisher while the other keeps racing; terminal measures equal results", async () => {
    const app = setup(); app.runtime.start(); await app.advance(4200);
    app.type(0); await app.advance(3000); app.type(1); await app.runtime.whenSaved();
    const rows = app.rows();
    expect(rows.map((row) => seriesOf(row).points.at(-1)?.elapsed)).toEqual([1200, 4200]);
    for (const row of rows) {
      const series = seriesOf(row);
      expect(series.points.at(-1)?.measures).toEqual({ netWpm: row.netWpm, rawWpm: row.rawWpm, accuracy: row.accuracy });
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(series)).toBe(true);
    }
    expect(Object.isFrozen(rows)).toBe(true);
  });

  it("skips overdue sampling before a delayed engine timer and keeps the real deadline", async () => {
    const app = setup(); app.runtime.start(); await app.advance(4000);
    app.type(0, "a"); app.jump(60_000);
    await app.lateTimersNewestFirst(); await app.runtime.whenSaved();
    expect(app.runtime.stage).toBe("saved");
    for (const row of app.rows()) {
      expect(row.elapsedMs).toBe(30_000);
      expect(seriesOf(row).points.at(-1)?.elapsed).toBe(30_000);
      expect(seriesOf(row).points.every((point) => point.elapsed <= 30_000)).toBe(true);
    }
  });

  it("does not remove suspended lease time from WPM duration", async () => {
    const app = setup(); app.runtime.start(); await app.advance(4000); app.type(0, "a");
    app.lease.state = "suspended"; app.runtime.leaseChanged("suspended");
    await app.advance(5000);
    expect(app.type(0, "b", 2)).toEqual({ ok: false, error: "SUSPENDED" });
    app.lease.state = "held"; app.runtime.leaseChanged("held");
    app.type(0, "b", 2); app.type(1); await app.runtime.whenSaved();
    expect(app.rows().map((row) => row.elapsedMs)).toEqual([6000, 6000]);
    expect(seriesOf(app.rows()[0]).points.at(-1)?.measures).toEqual(computeMeasures({ totalInserts: 2, correctInserts: 2 }, asDuration(6000)));
  });

  it("saves an exact zero terminal observation for countdown abandonment", async () => {
    const app = setup(); app.runtime.start();
    app.runtime.memberLeft("alice"); app.runtime.memberLeft("bob");
    await app.advance(3000); await app.runtime.whenSaved();
    for (const row of app.rows()) expect(seriesOf(row).points).toEqual([
      { elapsed: 0, counters: { totalInserts: 0, correctInserts: 0 }, measures: { netWpm: 0, rawWpm: 0, accuracy: 0 } },
    ]);
  });

  it("retries and shutdown send the same frozen array and series", async () => {
    const app = setup({ store: { finalizeRace: vi.fn()
      .mockRejectedValueOnce(new Error("lost answer"))
      .mockImplementation(() => new Promise(() => undefined)) } });
    app.runtime.start(); await app.advance(4000); app.type(0); app.type(1);
    await app.advance(1000);
    const shutdown = app.runtime.shutdown(START + 6000);
    await app.advance(1000); await shutdown;
    const calls = app.store.finalizeRace.mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]); expect(calls[2]?.[1]).toBe(calls[0]?.[1]);
    expect(app.timers.size).toBe(0);
  });

  it.each(["lost", "retired", "closed", "shutdown"])("stops collecting without a result when %s", async (reason) => {
    const app = setup(); app.runtime.start(); await app.advance(4000);
    if (reason === "lost") app.runtime.leaseChanged("lost");
    if (reason === "retired") app.runtime.retire();
    if (reason === "closed") app.runtime.roomClosed();
    if (reason === "shutdown") await app.runtime.shutdown();
    await app.advance(60_000);
    expect(app.timers.size).toBe(0);
    expect(app.store.finalizeRace).not.toHaveBeenCalled();
  });
});
