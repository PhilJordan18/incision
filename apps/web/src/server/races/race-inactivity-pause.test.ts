import type { RaceOwnership } from "@incision/database";
import {
  asDuration,
  asEntrantId,
  asInstant,
  asRaceId,
  COUNTDOWN_MS,
  createBonusRace,
  INACTIVITY_ABANDON_MS,
  INACTIVITY_WARNING_MS,
  RESUME_GRACE_MS,
  type BonusRaceState,
} from "@incision/domain";
import { describe, expect, it, vi } from "vitest";

// The real engine. The spy counts reductions, and can make one take a while, as a busy process would.
const engine = vi.hoisted(() => ({ reductions: 0, during: undefined as (() => void) | undefined }));
vi.mock("@incision/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@incision/domain")>();
  return {
    ...actual,
    reduceBonusRace: (...args: Parameters<typeof actual.reduceBonusRace>) => {
      engine.reductions += 1;
      const during = engine.during;
      engine.during = undefined;
      during?.();
      return actual.reduceBonusRace(...args);
    },
  };
});
import type { LeaseState } from "./race-lease";
import { type LeaseView, type RaceConnection, RaceRuntime, type RaceStore } from "./race-runtime";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const ALICE = { entrantId: "e-alice", accountId: "a-alice", displayName: "Alice" };
const BOB = { entrantId: "e-bob", accountId: "a-bob", displayName: "Bob" };
const START = 1_800_000_000_000;
/** The common start: every runner's inactivity counts from here until its first action. */
const S = START + COUNTDOWN_MS;
const ownership: RaceOwnership = { raceId: RACE, lobbyId: "lobby-1", ownerId: "owner-a", ownerEpoch: 1 };
/**
 * The lease runs on a monotonic clock, not on the engine's: another origin, and the engine's
 * instant is that clock floored, half a millisecond behind it here.
 */
const MONOTONIC_OFFSET = 7_000.5;

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

/** A fake clock and timer queue; `jump` moves the clock without running timers. */
function fakeTime() {
  let now = START;
  let next = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    jump: (ms: number) => {
      now += ms;
    },
    schedule: (callback: () => void, delayMs: number) => {
      const id = next++;
      timers.set(id, { at: now + Math.max(0, delayMs), callback });
      return () => void timers.delete(id);
    },
    async advanceTo(target: number) {
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (due === undefined) {
          break;
        }
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
        await settle();
      }
      now = Math.max(now, target);
      await settle();
    },
    pending: () => timers.size,
  };
}

/**
 * A lease the test drives. Like `RaceLease`, it notices a deadline that passed when it is read, or
 * at that deadline when its own timer is on time, and reports it through `onChange` synchronously,
 * from inside that read. It counts the reductions made from inside `onChange`.
 */
function fakeLease(time: ReturnType<typeof fakeTime>) {
  let state: LeaseState = "held";
  let authorityEndsAt: number | undefined;
  let listener: (state: LeaseState) => void = () => undefined;
  const monotonic = () => time.now() - START + MONOTONIC_OFFSET;
  const record = { reductionsInsideOnChange: 0, changes: [] as LeaseState[] };
  const change = (next: LeaseState) => {
    state = next;
    record.changes.push(next);
    const before = engine.reductions;
    listener(next);
    record.reductionsInsideOnChange += engine.reductions - before;
  };
  const notice = () => {
    if (state === "held" && authorityEndsAt !== undefined && monotonic() >= authorityEndsAt) {
      change("suspended");
    }
  };
  const lease: LeaseView & {
    listen: (next: (state: LeaseState) => void) => void;
    endAuthorityAt: (instant: number, noticed: "on time" | "when read", fraction?: number) => void;
    resume: () => void;
    lose: () => void;
    record: typeof record;
  } = {
    start: vi.fn(),
    stop: vi.fn(() => {
      state = "stopped";
    }),
    isAuthoritative: () => {
      notice();
      return state === "held";
    },
    get state() {
      notice();
      return state;
    },
    suspendedForMs: () => {
      notice();
      return state === "suspended" && authorityEndsAt !== undefined ? monotonic() - authorityEndsAt : undefined;
    },
    listen: (next) => {
      listener = next;
    },
    /**
     * Authority ends within the engine's millisecond `instant`, `fraction` into it on the
     * monotonic clock (0.5: exactly when the engine's clock reads `instant`).
     */
    endAuthorityAt: (instant, noticed, fraction = 0.5) => {
      authorityEndsAt = instant - START + MONOTONIC_OFFSET - 0.5 + fraction;
      if (noticed === "on time") {
        time.schedule(notice, instant + (fraction > 0.5 ? 1 : 0) - time.now());
      }
    },
    /** A renewal is confirmed: held again, now. */
    resume: () => {
      authorityEndsAt = undefined;
      change("held");
    },
    lose: () => change("lost"),
    record,
  };
  return lease;
}

const WON = { won: true, alreadyDone: false } as const;

function created(timeLimitMs: number | null): BonusRaceState {
  const result = createBonusRace({ enabled: false, random: [1, 2, 3, 4], race: {
    raceId: asRaceId(RACE),
    text: "abcdef",
    errorMode: "mandatory",
    timeLimit: timeLimitMs === null ? null : asDuration(timeLimitMs),
    participants: [ALICE, BOB].map(({ entrantId }) => ({ entrantId: asEntrantId(entrantId), kind: "human" as const })),
    now: asInstant(START),
  } });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.state;
}

function tab(id: string, accountId: string): RaceConnection {
  return { id, accountId, emit: () => undefined };
}

const batch = (seq: number, graphemes: string) => ({
  raceId: RACE,
  seq,
  textVersion: 0,
  events: [...graphemes].map((grapheme) => ({ type: "insert" as const, grapheme })),
});

function setup({ timeLimitMs = null }: { timeLimitMs?: number | null } = {}) {
  const time = fakeTime();
  const lease = fakeLease(time);
  const store = {
    beginRacing: vi.fn<RaceStore["beginRacing"]>(async () => WON),
    finalizeRace: vi.fn<RaceStore["finalizeRace"]>(async () => WON),
    interruptOwnRace: vi.fn<RaceStore["interruptOwnRace"]>(async () => WON),
  };
  const alice = tab("tab-alice", ALICE.accountId);
  const bob = tab("tab-bob", BOB.accountId);
  const followers = [alice, bob];
  const settled = vi.fn();
  const runtime = new RaceRuntime({
    ownership,
    state: created(timeLimitMs),
    entrants: [ALICE, BOB],
    language: "fr",
    store,
    lease,
    now: time.now,
    schedule: time.schedule,
    followers: () => followers,
    onSettled: settled,
    log: vi.fn(),
  });
  lease.listen((state) => runtime.leaseChanged(state));
  runtime.start();
  const entrant = (id: string) => runtime.state.entrants.find((one) => one.entrantId === id);
  return { runtime, time, lease, store, settled, alice, bob, followers, entrant };
}

describe("RaceRuntime: inactivity paused while the lease is suspended (D-17, #168)", () => {
  it("noticed only at the abandon's tick: no abandon, the marker kept, the abandon moved by the suspension", async () => {
    const { runtime, time, lease, store, alice, entrant } = setup();
    await time.advanceTo(S + INACTIVITY_WARNING_MS);
    expect(entrant(ALICE.entrantId)?.inactive).toBe(true);
    // Authority ends at 100 s, and nothing reads the lease before the 120 s abandon falls due.
    lease.endAuthorityAt(S + 100_000, "when read");
    await time.advanceTo(S + INACTIVITY_ABANDON_MS + 1);
    expect(runtime.state.inactivityPausedAt).toBe(S + 100_000);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "racing", inactive: true });
    // Nobody can answer while suspended, so the marker stays.
    expect(runtime.present(alice)).toBe("SUSPENDED");
    expect(entrant(ALICE.entrantId)?.inactive).toBe(true);
    // Held again at 150 s: 20 s were left at the pause, so the abandon comes at 170 s.
    await time.advanceTo(S + 150_000);
    lease.resume();
    await time.advanceTo(S + 170_000);
    expect(runtime.state.inactivityPausedAt).toBeUndefined();
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "racing", inactive: true });
    await time.advanceTo(S + 170_001);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "abandoned", abandonReason: "inactivity", endedAt: S + 170_000 });
    expect(lease.record.reductionsInsideOnChange).toBe(0);
    expect(store.interruptOwnRace).not.toHaveBeenCalled();
  });

  it("counts an answer given exactly at the moved deadline, and clears the marker once held again", async () => {
    const { time, lease, alice, runtime, entrant } = setup();
    lease.endAuthorityAt(S + 100_000, "on time");
    await time.advanceTo(S + 130_000);
    lease.resume();
    // 30 s paused: both abandons move from 120 s to 150 s.
    await time.advanceTo(S + 150_000);
    expect(runtime.present(alice)).toBe("ok");
    await time.advanceTo(S + 150_001);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "racing", inactive: false, lastActivityAt: S + 150_000 });
    expect(entrant(BOB.entrantId)).toMatchObject({ status: "abandoned", abandonReason: "inactivity", endedAt: S + 150_000 });
  });

  it("applies a pause and a resume queued with no reduction in between, in order", async () => {
    const { runtime, time, lease, alice, entrant } = setup();
    lease.endAuthorityAt(S + 30_000, "when read");
    await time.advanceTo(S + 40_000);
    // The « Je suis là » reads the lease first: it notices the suspension and is refused.
    expect(runtime.present(alice)).toBe("SUSPENDED");
    lease.resume();
    // 10 s paused: the marker comes at 70 s and the abandon at 130 s.
    await time.advanceTo(S + 70_000 - 1);
    expect(runtime.state.inactivityPausedAt).toBeUndefined();
    expect(entrant(ALICE.entrantId)).toMatchObject({ inactive: false, lastActivityAt: S + 10_000 });
    await time.advanceTo(S + 70_000);
    expect(entrant(ALICE.entrantId)?.inactive).toBe(true);
    await time.advanceTo(S + 130_001);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "abandoned", abandonReason: "inactivity", endedAt: S + 130_000 });
    expect(lease.record.reductionsInsideOnChange).toBe(0);
  });

  it("queues a suspension noticed while an event is handled, reduces nothing from inside, and dates it from its deadline", async () => {
    const { runtime, time, lease, entrant } = setup();
    lease.endAuthorityAt(S + 61_000, "when read");
    await time.advanceTo(S + 60_000 - 1);
    // The marker's tick at 60 s reads a held lease, then its reduction takes 2 s: the read that
    // follows it notices the suspension, inside the runtime's handling of that tick.
    engine.during = () => time.jump(2_000);
    const changes = lease.record.changes.length;
    await time.advanceTo(S + 60_000);
    expect(lease.record.changes.slice(changes)).toEqual(["suspended"]);
    expect(lease.record.reductionsInsideOnChange).toBe(0);
    // The marker was due before the suspension; the abandon never comes while it lasts.
    await time.advanceTo(S + INACTIVITY_ABANDON_MS + 1);
    expect(runtime.state.inactivityPausedAt).toBe(S + 61_000);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "racing", inactive: true });
  });

  it("dates the pause on the lease's clock: never after the deadline that passed, at most 1 ms before it", async () => {
    const late = setup();
    late.lease.endAuthorityAt(S + 30_000, "when read", 0.75);
    await late.time.advanceTo(S + 45_000);
    expect(late.runtime.present(late.alice)).toBe("SUSPENDED");
    await late.time.advanceTo(S + INACTIVITY_WARNING_MS);
    expect(late.runtime.state.inactivityPausedAt).toBe(S + 30_000);
    const early = setup();
    early.lease.endAuthorityAt(S + 30_000, "when read", 0.25);
    await early.time.advanceTo(S + 45_000);
    expect(early.runtime.present(early.alice)).toBe("SUSPENDED");
    await early.time.advanceTo(S + INACTIVITY_WARNING_MS);
    expect(early.runtime.state.inactivityPausedAt).toBe(S + 30_000 - 1);
    expect(early.entrant(ALICE.entrantId)?.inactive).toBe(false);
  });

  it("keeps the time limit and the 30 s grace running while paused", async () => {
    const { runtime, time, lease, followers, bob, entrant } = setup({ timeLimitMs: 120_000 });
    lease.endAuthorityAt(S + 10_000, "on time");
    await time.advanceTo(S + 20_000);
    // Bob's only tab closes during the pause: abandoned for disconnection 30 s later.
    followers.splice(followers.indexOf(bob), 1);
    runtime.unfollow(bob.id, BOB.accountId);
    await time.advanceTo(S + 20_000 + RESUME_GRACE_MS + 1);
    expect(entrant(BOB.entrantId)).toMatchObject({ status: "abandoned", abandonReason: "disconnection", endedAt: S + 20_000 + RESUME_GRACE_MS });
    await time.advanceTo(S + 120_000);
    expect(runtime.state.phase).toBe("ended");
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "timedOut", endedAt: S + 120_000 });
  });

  it("adds up two suspensions exactly, each from its own deadline", async () => {
    const { time, lease, entrant } = setup();
    lease.endAuthorityAt(S + 10_000, "on time");
    await time.advanceTo(S + 15_000);
    lease.resume();
    lease.endAuthorityAt(S + 30_000, "on time");
    await time.advanceTo(S + 37_000);
    lease.resume();
    // 5 s then 7 s paused: the abandon comes at 132 s.
    await time.advanceTo(S + 132_000);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "racing", lastActivityAt: S + 12_000 });
    await time.advanceTo(S + 132_001);
    expect(entrant(ALICE.entrantId)).toMatchObject({ status: "abandoned", abandonReason: "inactivity", endedAt: S + 132_000 });
  });

  it("stops the race for good when the lease is lost while suspended: no resume, no result, no timer left", async () => {
    const { runtime, time, lease, store, settled } = setup();
    lease.endAuthorityAt(S + 10_000, "on time");
    await time.advanceTo(S + 70_000);
    lease.lose();
    expect(runtime.stage).toBe("lost");
    expect(settled).toHaveBeenCalledExactlyOnceWith(ownership, "lost");
    await time.advanceTo(S + 300_000);
    expect(store.finalizeRace).not.toHaveBeenCalled();
    expect(time.pending()).toBe(0);
  });

  it("subtracts nothing from the results: the same rows as a race with no suspension", async () => {
    const race = async (suspend: boolean) => {
      const { runtime, time, lease, store, alice, bob } = setup();
      await time.advanceTo(S + 1_000);
      expect(runtime.keystrokes(alice, batch(1, "abc"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
      if (suspend) {
        lease.endAuthorityAt(S + 10_000, "on time");
        await time.advanceTo(S + 40_000);
        lease.resume();
      }
      await time.advanceTo(S + 50_000);
      expect(runtime.abandon(bob)).toBe("ok");
      expect(runtime.keystrokes(alice, batch(2, "def"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
      await time.advanceTo(S + 51_000);
      expect(store.finalizeRace).toHaveBeenCalledOnce();
      return store.finalizeRace.mock.calls[0]?.[1];
    };
    const paused = await race(true);
    expect(paused?.find((row) => row.entrantId === ALICE.entrantId)).toMatchObject({ outcome: "finished", elapsedMs: 50_000 });
    expect(paused).toEqual(await race(false));
  });

  it("never moves the WPM series back for a pause noticed late: no interruption, its last point is the result", async () => {
    const { runtime, time, lease, store, alice, bob } = setup();
    await time.advanceTo(S + 1_000);
    expect(runtime.keystrokes(alice, batch(1, "abc"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    // Authority ends at 10 s; the series keeps sampling until a batch reads the lease at 30 s.
    lease.endAuthorityAt(S + 10_000, "when read");
    await time.advanceTo(S + 30_000);
    expect(runtime.keystrokes(alice, batch(2, "def"))).toEqual({ ok: false, error: "SUSPENDED" });
    await time.advanceTo(S + 40_000);
    expect(runtime.state.inactivityPausedAt).toBe(S + 10_000);
    lease.resume();
    await time.advanceTo(S + 50_000);
    expect(runtime.abandon(bob)).toBe("ok");
    expect(runtime.keystrokes(alice, batch(2, "def"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    await time.advanceTo(S + 51_000);
    expect(store.interruptOwnRace).not.toHaveBeenCalled();
    const row = store.finalizeRace.mock.calls[0]?.[1].find((one) => one.entrantId === ALICE.entrantId);
    if (row === undefined || "unavailable" in row.wpmSeries) {
      throw new Error("A finished runner has a WPM series");
    }
    expect(row.wpmSeries.points.at(-1)).toMatchObject({
      elapsed: 50_000,
      measures: { netWpm: row.netWpm, rawWpm: row.rawWpm, accuracy: row.accuracy },
    });
  });
});
