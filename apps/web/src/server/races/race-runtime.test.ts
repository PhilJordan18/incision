import type { Interruption, RaceOwnership, RaceResultRow, Transition } from "@incision/database";
import {
  asDuration,
  asEntrantId,
  asInstant,
  asRaceId,
  COUNTDOWN_MS,
  createRace,
  INACTIVITY_ABANDON_MS,
  INACTIVITY_WARNING_MS,
  type RaceState,
  RESUME_GRACE_MS,
} from "@incision/domain";
import { describe, expect, it, vi } from "vitest";

// The real engine everywhere; one test makes its reducer throw, as an engine fault would.
const engine = vi.hoisted(() => ({ failNext: false }));
vi.mock("@incision/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@incision/domain")>();
  return {
    ...actual,
    reduceRace: (...args: Parameters<typeof actual.reduceRace>) => {
      if (engine.failNext) {
        engine.failNext = false;
        throw new RangeError("engine fault");
      }
      return actual.reduceRace(...args);
    },
  };
});
import {
  RACE_CONFIRMING_EVENT,
  RACE_PROGRESS_EVENT,
  RACE_REVEAL_EVENT,
  RACE_SELF_EVENT,
  type RaceProgressPayload,
  type RaceRevealPayload,
  type RaceSelfPayload,
} from "../../races/protocol";
import type { LeaseState } from "./race-lease";
import { type LeaseView, type RaceConnection, RaceRuntime, type RaceStore } from "./race-runtime";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const ALICE = { entrantId: "e-alice", accountId: "a-alice", displayName: "Alice" };
const BOB = { entrantId: "e-bob", accountId: "a-bob", displayName: "Bob" };
const START = 1_800_000_000_000;
const ownership: RaceOwnership = { raceId: RACE, lobbyId: "lobby-1", ownerId: "owner-a", ownerEpoch: 1 };

/** Lets the promises already started settle (fake writes resolve within a few turns). */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}

/**
 * A fake clock and timer queue: `advance` runs what falls due, in order. `earlyMs` makes every
 * timer fire that much early, as real timers rounded to the millisecond can.
 */
function fakeTime(earlyMs = 0) {
  let now = START;
  let next = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    schedule: (callback: () => void, delayMs: number) => {
      const id = next++;
      // Early, but never at once: a timer of 1 ms or more still fires after the current instant.
      timers.set(id, { at: delayMs <= 0 ? now : now + Math.max(1, delayMs - earlyMs), callback });
      return () => void timers.delete(id);
    },
    async advance(ms: number) {
      const target = now + ms;
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
      now = target;
      await settle();
    },
    pending: () => timers.size,
  };
}

function tab(id: string, accountId: string, pageId?: string) {
  const received: { event: string; payload: unknown; volatile: boolean }[] = [];
  const connection: RaceConnection = {
    id,
    accountId,
    ...(pageId === undefined ? {} : { pageId }),
    emit: (event, payload, options) => void received.push({ event, payload, volatile: options?.volatile === true }),
  };
  return {
    connection,
    received,
    last<Payload>(event: string): Payload | undefined {
      return received.filter((message) => message.event === event).at(-1)?.payload as Payload | undefined;
    },
    count: (event: string) => received.filter((message) => message.event === event).length,
  };
}

function fakeLease() {
  let state: LeaseState = "held";
  const lease: LeaseView & { set: (next: LeaseState) => void } = {
    start: vi.fn(),
    stop: vi.fn(() => {
      state = "stopped";
    }),
    isAuthoritative: () => state === "held",
    get state() {
      return state;
    },
    set: (next) => {
      state = next;
    },
  };
  return lease;
}

const WON = { won: true, alreadyDone: false } as const;

function fakeStore(overrides: Partial<RaceStore> = {}) {
  return {
    beginRacing: vi.fn<RaceStore["beginRacing"]>(overrides.beginRacing ?? (async () => WON)),
    finalizeRace: vi.fn<RaceStore["finalizeRace"]>(overrides.finalizeRace ?? (async () => WON)),
    interruptOwnRace: vi.fn<RaceStore["interruptOwnRace"]>(overrides.interruptOwnRace ?? (async () => WON)),
  };
}

function created(text = "ab", timeLimitMs: number | null = 120_000): RaceState {
  const result = createRace({
    raceId: asRaceId(RACE),
    text,
    errorMode: "mandatory",
    timeLimit: timeLimitMs === null ? null : asDuration(timeLimitMs),
    participants: [ALICE, BOB].map(({ entrantId }) => ({ entrantId: asEntrantId(entrantId), kind: "human" as const })),
    now: asInstant(START),
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.race;
}

function setup({ state = created(), store = fakeStore(), earlyMs = 0 }: { state?: RaceState; store?: ReturnType<typeof fakeStore>; earlyMs?: number } = {}) {
  const time = fakeTime(earlyMs);
  const lease = fakeLease();
  const alice = tab("tab-alice", ALICE.accountId);
  const bob = tab("tab-bob", BOB.accountId);
  const spectator = tab("tab-spectator", "a-spectator");
  const followers = [alice.connection, bob.connection, spectator.connection];
  const settled = vi.fn();
  const log = vi.fn();
  const runtime = new RaceRuntime({
    ownership,
    state,
    entrants: [ALICE, BOB],
    language: "fr",
    store,
    lease,
    now: time.now,
    schedule: time.schedule,
    followers: () => followers,
    onSettled: settled,
    log,
  });
  return { runtime, time, lease, store, alice, bob, spectator, followers, settled, log };
}

const batch = (seq: number, graphemes: string, extra: Partial<{ raceId: string; textVersion: number }> = {}) => ({
  raceId: RACE,
  seq,
  textVersion: 0,
  events: [...graphemes].map((grapheme) => ({ type: "insert" as const, grapheme })),
  ...extra,
});

describe("RaceRuntime", () => {
  it("reveals the race to every tab at the start, and gives each entrant's tab the input", () => {
    const { runtime, lease, alice, spectator } = setup();
    runtime.start();
    expect(lease.start).toHaveBeenCalledOnce();
    const reveal = alice.last<RaceRevealPayload>(RACE_REVEAL_EVENT);
    expect(reveal?.reveal).toMatchObject({ raceId: RACE, text: ["a", "b"], errorMode: "mandatory", startsAt: START + COUNTDOWN_MS, timeLimit: 120_000 });
    expect(reveal?.entrants).toEqual([
      { entrantId: "e-alice", displayName: "Alice" },
      { entrantId: "e-bob", displayName: "Bob" },
    ]);
    expect(reveal?.selfEntrantId).toBe("e-alice");
    expect(alice.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    // A spectator sees the race, never anyone's private typing state.
    expect(spectator.last<RaceRevealPayload>(RACE_REVEAL_EVENT)?.selfEntrantId).toBeNull();
    expect(spectator.count(RACE_SELF_EVENT)).toBe(0);
    expect(spectator.last<RaceProgressPayload>(RACE_PROGRESS_EVENT)?.broadcast.phase).toBe("countdown");
  });

  it("refuses keystrokes before the common start, then races once the server's clock reaches it", async () => {
    const { runtime, time, store, alice } = setup();
    runtime.start();
    const early = runtime.keystrokes(alice.connection, batch(1, "a"));
    expect(early).toMatchObject({ ok: true, result: { outcome: "refused", reason: "NOT_RACING" } });
    await time.advance(COUNTDOWN_MS);
    expect(runtime.state.phase).toBe("racing");
    expect(store.beginRacing).toHaveBeenCalledExactlyOnceWith(ownership);
    const applied = runtime.keystrokes(alice.connection, batch(1, "a"));
    expect(applied).toMatchObject({ ok: true, result: { outcome: "applied", ackSeq: 1 }, self: { snapshot: { typed: ["a"], ackSeq: 1 } } });
  });

  it("takes batches from the entrant's controlling tab only, and moves the input on request", async () => {
    const { runtime, time, alice, spectator, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    expect(runtime.keystrokes(second.connection, batch(1, "a"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(runtime.keystrokes(spectator.connection, batch(1, "a"))).toEqual({ ok: false, error: "NOT_AN_ENTRANT" });
    // The typing tab's batch reaches the other tab of the same entrant.
    runtime.keystrokes(alice.connection, batch(1, "a"));
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.snapshot.typed).toEqual(["a"]);
    expect(runtime.takeControl(second.connection)).toBe("ok");
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    // Asking again changes nothing: the asking tab gets its state again, the other tab nothing.
    const aliceBefore = alice.received.length;
    const secondBefore = second.received.length;
    expect(runtime.takeControl(second.connection)).toBe("ok");
    expect(alice.received.length).toBe(aliceBefore);
    expect(second.received.length).toBe(secondBefore + 1);
    expect(alice.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    // A late batch of the former tab is discarded before the engine.
    expect(runtime.keystrokes(alice.connection, batch(2, "b"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(runtime.keystrokes(second.connection, batch(2, "b"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    expect(runtime.takeControl(spectator.connection)).toBe("NOT_AN_ENTRANT");
  });

  it("gives the input to the next tab once the typing tab is gone, as after a reconnection", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    followers.splice(followers.indexOf(alice.connection), 1);
    runtime.unfollow(alice.connection.id, alice.connection.accountId);
    const back = tab("tab-alice-new", ALICE.accountId);
    followers.push(back.connection);
    runtime.follow(back.connection);
    const self = back.last<RaceSelfPayload>(RACE_SELF_EVENT);
    // The snapshot tells the new tab which batch was applied (ackSeq), so it resends nothing twice.
    expect(self).toMatchObject({ control: "controlling", snapshot: { typed: ["a"], ackSeq: 1 } });
    expect(runtime.keystrokes(back.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "duplicate", ackSeq: 1 } });
  });

  it("gives the input back to a page that reconnects before the server saw its former socket close", async () => {
    const { runtime, time, followers } = setup();
    const before = tab("tab-page-1", ALICE.accountId, "page-1");
    followers.splice(0, 1, before.connection);
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    runtime.keystrokes(before.connection, batch(1, "a"));
    // The same page, on a new socket, while the old one still counts as following.
    const after = tab("tab-page-1-again", ALICE.accountId, "page-1");
    followers.push(after.connection);
    runtime.follow(after.connection);
    expect(after.last<RaceSelfPayload>(RACE_SELF_EVENT)).toMatchObject({ control: "controlling", snapshot: { ackSeq: 1 } });
    expect(runtime.keystrokes(before.connection, batch(2, "b"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(runtime.keystrokes(after.connection, batch(2, "b"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    // Another page of the same player still observes when it opens.
    const other = tab("tab-page-2", ALICE.accountId, "page-2");
    followers.push(other.connection);
    runtime.follow(other.connection);
    expect(other.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
  });

  it("hands the input to the player's other tab once the typing tab is gone for good, and tells it", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    followers.splice(followers.indexOf(alice.connection), 1);
    runtime.unfollow(alice.connection.id, alice.connection.accountId);
    // A grace first: the closed page may come back.
    await time.advance(2_999);
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    await time.advance(1);
    expect(second.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    expect(runtime.keystrokes(second.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
  });

  it("reserves the input to the page that typed during the grace: another tab that reconnects first observes", async () => {
    const { runtime, time, followers } = setup();
    const typing = tab("tab-page-1", ALICE.accountId, "page-1");
    const other = tab("tab-page-2", ALICE.accountId, "page-2");
    followers.splice(0, 1, typing.connection);
    followers.push(other.connection);
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    // A blip closes both sockets; the other page reconnects first.
    followers.splice(followers.indexOf(typing.connection), 1);
    runtime.unfollow(typing.connection.id, typing.connection.accountId);
    followers.splice(followers.indexOf(other.connection), 1);
    runtime.unfollow(other.connection.id, other.connection.accountId);
    const otherBack = tab("tab-page-2-again", ALICE.accountId, "page-2");
    followers.push(otherBack.connection);
    runtime.follow(otherBack.connection);
    expect(otherBack.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    const typingBack = tab("tab-page-1-again", ALICE.accountId, "page-1");
    followers.push(typingBack.connection);
    runtime.follow(typingBack.connection);
    expect(typingBack.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
  });

  it("hands over to the most recent open tab after the grace, and never once control was taken meanwhile", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    const older = tab("tab-alice-older", ALICE.accountId);
    const newer = tab("tab-alice-newer", ALICE.accountId);
    followers.push(older.connection, newer.connection);
    runtime.follow(older.connection);
    runtime.follow(newer.connection);
    followers.splice(followers.indexOf(alice.connection), 1);
    runtime.unfollow(alice.connection.id, alice.connection.accountId);
    await time.advance(3_000);
    expect(newer.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    expect(older.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");

    // The newer tab closes; the older one takes the input on request during the grace.
    followers.splice(followers.indexOf(newer.connection), 1);
    runtime.unfollow(newer.connection.id, newer.connection.accountId);
    runtime.takeControl(older.connection);
    const late = tab("tab-alice-late", ALICE.accountId);
    followers.push(late.connection);
    runtime.follow(late.connection);
    await time.advance(3_000);
    // The cancelled hand-over gives nothing to the tab opened meanwhile.
    expect(late.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    expect(older.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
  });

  it("lets any tab take the input during the grace when the closed tab had no page id", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    followers.splice(followers.indexOf(alice.connection), 1);
    runtime.unfollow(alice.connection.id, alice.connection.accountId);
    const other = tab("tab-other-page", ALICE.accountId, "page-9");
    followers.push(other.connection);
    runtime.follow(other.connection);
    expect(other.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
  });

  it("keeps the input with a page that came back during the grace: a newer tab opened meanwhile still observes", async () => {
    const { runtime, time, followers } = setup();
    const typing = tab("tab-page-1", ALICE.accountId, "page-1");
    followers.splice(0, 1, typing.connection);
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    followers.splice(followers.indexOf(typing.connection), 1);
    runtime.unfollow(typing.connection.id, typing.connection.accountId);
    const back = tab("tab-page-1-again", ALICE.accountId, "page-1");
    followers.push(back.connection);
    runtime.follow(back.connection);
    const newer = tab("tab-page-2", ALICE.accountId, "page-2");
    followers.push(newer.connection);
    runtime.follow(newer.connection);
    await time.advance(5_000);
    expect(newer.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    expect(back.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
  });

  it("sends the other tabs nothing for a batch that changed nothing, and reliably the state of an entrant who finished", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    const count = second.received.length;
    // A retry of an applied batch: duplicate, nothing changed, nothing sent to the other tab.
    runtime.keystrokes(alice.connection, batch(1, "a"));
    expect(second.received.length).toBe(count);
    // Alice finishes while Bob still races: her other tab gets her last state reliably.
    runtime.keystrokes(alice.connection, batch(2, "b"));
    expect(runtime.state.phase).toBe("racing");
    expect(second.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1)).toMatchObject({ volatile: false, payload: { snapshot: { status: "finished" } } });
  });

  it("hands nothing over once the race has settled during the grace", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    followers.splice(followers.indexOf(alice.connection), 1);
    runtime.unfollow(alice.connection.id, alice.connection.accountId);
    runtime.roomClosed();
    const before = second.received.length;
    await time.advance(5_000);
    expect(second.received.length).toBe(before);
  });

  it("keeps the input with the page that comes back within the grace, even with another tab open", async () => {
    const { runtime, time, followers } = setup();
    const typing = tab("tab-page-1", ALICE.accountId, "page-1");
    const other = tab("tab-page-2", ALICE.accountId, "page-2");
    followers.splice(0, 1, typing.connection);
    followers.push(other.connection);
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    expect(typing.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    // A network blip on the typing page: its socket closes, then the page reconnects.
    followers.splice(followers.indexOf(typing.connection), 1);
    runtime.unfollow(typing.connection.id, typing.connection.accountId);
    await time.advance(500);
    const back = tab("tab-page-1-again", ALICE.accountId, "page-1");
    followers.push(back.connection);
    runtime.follow(back.connection);
    await time.advance(5_000);
    expect(back.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("controlling");
    expect(other.last<RaceSelfPayload>(RACE_SELF_EVENT)?.control).toBe("observing");
    expect(runtime.keystrokes(back.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
  });

  it("accepts nothing and broadcasts nothing while its lease is not confirmed, then catches up", async () => {
    const { runtime, time, lease, alice, bob } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    const before = bob.count(RACE_PROGRESS_EVENT);
    lease.set("suspended");
    expect(runtime.keystrokes(alice.connection, batch(1, "a"))).toEqual({ ok: false, error: "SUSPENDED" });
    lease.set("held");
    runtime.keystrokes(alice.connection, batch(1, "a"));
    lease.set("suspended");
    await time.advance(1_000);
    expect(bob.count(RACE_PROGRESS_EVENT)).toBe(before);
    lease.set("held");
    runtime.leaseChanged("held");
    await time.advance(0);
    expect(bob.last<RaceProgressPayload>(RACE_PROGRESS_EVENT)?.broadcast.entrants[0]?.position).toBe(1);
  });

  it("broadcasts everyone's progress at most four times a second", async () => {
    const { runtime, time, alice, bob } = setup({ state: created("abcdefghij") });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 5_000);
    const before = bob.count(RACE_PROGRESS_EVENT);
    for (let seq = 1; seq <= 5; seq += 1) {
      runtime.keystrokes(alice.connection, batch(seq, "abcdefghij"[seq - 1] ?? ""));
      await time.advance(50);
    }
    // 5 changes in 250 ms: at most two broadcasts (the first at once, then one 250 ms later).
    await time.advance(250);
    const sent = bob.count(RACE_PROGRESS_EVENT) - before;
    expect(sent).toBeGreaterThanOrEqual(1);
    expect(sent).toBeLessThanOrEqual(2);
    expect(bob.last<RaceProgressPayload>(RACE_PROGRESS_EVENT)?.broadcast.entrants[0]?.position).toBe(5);
  });

  it("sends another tab's typing as replaceable, but a change of control and the finishing state reliably", async () => {
    const { runtime, time, alice, bob, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    expect(second.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1)?.volatile).toBe(true);
    runtime.takeControl(second.connection);
    expect(second.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1)).toMatchObject({ volatile: false, payload: { control: "controlling" } });
    expect(alice.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1)).toMatchObject({ volatile: false, payload: { control: "observing" } });
    // Asking again resends this tab its state, reliably, and nothing to the others.
    const aliceCount = alice.received.length;
    runtime.takeControl(second.connection);
    expect(second.received.at(-1)).toMatchObject({ event: RACE_SELF_EVENT, volatile: false });
    expect(alice.received.length).toBe(aliceCount);
    // The batch that finishes the race: the other tab gets its last state reliably.
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    runtime.keystrokes(second.connection, batch(2, "b"));
    expect(alice.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1)).toMatchObject({ volatile: false, payload: { snapshot: { status: "finished" } } });
  });

  it("gives each entrant the engine's own live measures, equal to the broadcast's at the same instant", async () => {
    const { runtime, time, alice, bob } = setup({ state: created("abcdefgh") });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 3_000);
    const ack = runtime.keystrokes(alice.connection, batch(1, "abcd"));
    await time.advance(0);
    runtime.follow(bob.connection);
    const progress = bob.last<RaceProgressPayload>(RACE_PROGRESS_EVENT);
    expect(ack.ok && ack.self.measures.netWpm).toBe(progress?.broadcast.entrants[0]?.netWpm);
    expect(ack.ok && ack.self.measures.netWpm).toBeGreaterThan(0);
  });

  it("writes nothing more once the race ended during a retry's wait", async () => {
    const store = fakeStore({ beginRacing: vi.fn(() => Promise.reject(new Error("timeout"))) });
    const { runtime, time } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    expect(store.beginRacing).toHaveBeenCalledOnce();
    // The ownership is lost while the first retry waits: no retry follows.
    runtime.leaseChanged("lost");
    await time.advance(20_000);
    expect(store.beginRacing).toHaveBeenCalledOnce();
  });

  it("sends progress and another tab's typing as replaceable messages, never the reveal", async () => {
    const { runtime, time, alice, bob } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    await time.advance(300);
    expect(bob.received.filter((message) => message.event === RACE_PROGRESS_EVENT).at(-1)?.volatile).toBe(true);
    expect(bob.received.find((message) => message.event === RACE_REVEAL_EVENT)?.volatile).toBe(false);
  });

  it("stops for good when a newer race of the room replaces it here", async () => {
    const { runtime, time, lease, settled, store } = setup();
    runtime.start();
    runtime.retire();
    expect(runtime.stage).toBe("lost");
    expect(lease.stop).toHaveBeenCalled();
    expect(settled).toHaveBeenCalledOnce();
    await time.advance(200_000);
    expect(time.pending()).toBe(0);
    expect(store.beginRacing).not.toHaveBeenCalled();
  });

  it("never broadcasts progress closer than 250 ms apart, even when timers fire early", async () => {
    const { runtime, time, alice, bob } = setup({ state: created("abcdefghijklmnopqrstuvwxyz"), earlyMs: 1 });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 2_000);
    const text = "abcdefghijklmnopqrstuvwxyz";
    for (let seq = 1; seq <= 20; seq += 1) {
      runtime.keystrokes(alice.connection, batch(seq, text[seq - 1] ?? ""));
      await time.advance(60);
    }
    await time.advance(500);
    const sent = bob.received.filter((message) => message.event === RACE_PROGRESS_EVENT).map((message) => (message.payload as RaceProgressPayload).serverNow);
    const racing = sent.filter((serverNow) => serverNow > START + COUNTDOWN_MS);
    expect(racing.length).toBeGreaterThan(3);
    for (const [index, serverNow] of racing.entries()) {
      if (index > 0) {
        expect(serverNow - (racing[index - 1] ?? 0)).toBeGreaterThanOrEqual(250);
      }
    }
  });

  it("freezes the engine's results at the end, says they are being confirmed, and saves them once", async () => {
    const { runtime, time, store, lease, alice, bob, settled } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 2_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    expect(alice.last(RACE_CONFIRMING_EVENT)).toEqual({ raceId: RACE });
    await runtime.whenSaved();
    expect(store.finalizeRace).toHaveBeenCalledOnce();
    const [, rows] = store.finalizeRace.mock.calls[0] as unknown as [RaceOwnership, RaceResultRow[]];
    expect(rows.map((row) => [row.entrantId, row.rank, row.outcome, row.position, row.length, row.elapsedMs])).toEqual([
      ["e-alice", 1, "finished", 2, 2, 2_000],
      ["e-bob", 2, "finished", 2, 2, 2_000],
    ]);
    expect(rows[0]).toMatchObject({ correctInputs: 2, totalInputs: 2, accuracy: 100 });
    expect(runtime.stage).toBe("saved");
    expect(settled).toHaveBeenCalledExactlyOnceWith(ownership, "saved");
    expect(lease.stop).toHaveBeenCalled();
    expect(time.pending()).toBe(0);
  });

  it("retries a failed save with the same frozen results, and takes an earlier commit as saved", async () => {
    const answers: (() => Promise<Transition>)[] = [
      () => Promise.reject(new Error("timeout")),
      () => Promise.reject(new Error("connection lost")),
      () => Promise.resolve({ won: true, alreadyDone: true }),
    ];
    const store = fakeStore({ finalizeRace: vi.fn(() => (answers.shift() ?? (() => Promise.resolve(WON)))()) });
    const { runtime, time, alice, bob, settled } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    await time.advance(10_000);
    await runtime.whenSaved();
    const calls = store.finalizeRace.mock.calls as unknown as [RaceOwnership, RaceResultRow[]][];
    expect(calls).toHaveLength(3);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(calls[2]?.[1]).toBe(calls[0]?.[1]);
    expect(store.interruptOwnRace).not.toHaveBeenCalled();
    expect(runtime.stage).toBe("saved");
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each([
    ["the interruption wins", { won: true, alreadyDone: false } as Interruption, "interrupted"],
    ["an earlier save had committed after all", { won: false, resultsSaved: true } as Interruption, "saved"],
    ["the race ended elsewhere", { won: false, resultsSaved: false } as Interruption, "lost"],
  ])("gives up saving explicitly after the last retry (save_failed): %s", async (_label, answer, stage) => {
    const store = fakeStore({ finalizeRace: vi.fn(() => Promise.reject(new Error("timeout"))), interruptOwnRace: vi.fn(async () => answer) });
    const { runtime, time, alice, bob } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    await time.advance(60_000);
    await runtime.whenSaved();
    expect(store.finalizeRace).toHaveBeenCalledTimes(5);
    expect(store.interruptOwnRace).toHaveBeenCalledExactlyOnceWith(ownership, "save_failed");
    expect(runtime.stage).toBe(stage);
  });

  it("publishes neither saved nor interrupted while the database never answers", async () => {
    const store = fakeStore({ finalizeRace: vi.fn(() => Promise.reject(new Error("down"))), interruptOwnRace: vi.fn(() => Promise.reject(new Error("down"))) });
    const { runtime, time, alice, bob, log } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    await time.advance(60_000);
    await runtime.whenSaved();
    expect(runtime.stage).toBe("lost");
    expect(store.interruptOwnRace).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("could be confirmed"));
  });

  it("times out the entrants still racing at the time limit, ranked by progress", async () => {
    const { runtime, time, store, alice } = setup({ state: created("abcd", 30_000) });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    await time.advance(30_000);
    await runtime.whenSaved();
    const [, rows] = store.finalizeRace.mock.calls[0] as unknown as [RaceOwnership, RaceResultRow[]];
    expect(rows.map((row) => [row.entrantId, row.rank, row.outcome, row.position])).toEqual([
      ["e-alice", 1, "timed_out", 2],
      ["e-bob", 2, "timed_out", 0],
    ]);
  });

  it("abandons a member who leaves the room during the race, who keeps a result", async () => {
    const { runtime, time, store, alice } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.memberLeft(BOB.accountId);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    await runtime.whenSaved();
    const [, rows] = store.finalizeRace.mock.calls[0] as unknown as [RaceOwnership, RaceResultRow[]];
    expect(rows.map((row) => [row.entrantId, row.outcome, row.abandonmentReason])).toEqual([
      ["e-alice", "finished", undefined],
      ["e-bob", "abandoned", "voluntary"],
    ]);
  });

  it("ends without results when the room closes, and writes nothing itself", async () => {
    const { runtime, time, store, alice, settled } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    runtime.roomClosed();
    expect(runtime.state.phase).toBe("interrupted");
    expect(runtime.stage).toBe("interrupted");
    expect(settled).toHaveBeenCalledOnce();
    expect(store.finalizeRace).not.toHaveBeenCalled();
    expect(store.interruptOwnRace).not.toHaveBeenCalled();
    expect(runtime.keystrokes(alice.connection, batch(2, "b"))).toEqual({ ok: false, error: "NO_RACE" });
    await time.advance(200_000);
    expect(time.pending()).toBe(0);
  });

  it("stops for good when its ownership is lost during the race, and ignores what comes later", async () => {
    const { runtime, time, alice, settled, store } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.leaseChanged("lost");
    expect(runtime.stage).toBe("lost");
    expect(runtime.keystrokes(alice.connection, batch(1, "a"))).toEqual({ ok: false, error: "NO_RACE" });
    runtime.leaseChanged("held");
    await time.advance(200_000);
    expect(runtime.stage).toBe("lost");
    expect(settled).toHaveBeenCalledOnce();
    expect(store.finalizeRace).not.toHaveBeenCalled();
  });

  it("lets the save in flight decide when the ownership is lost while the results are saved", async () => {
    let finish: (answer: Transition) => void = () => undefined;
    const store = fakeStore({ finalizeRace: vi.fn(() => new Promise<Transition>((resolve) => (finish = resolve))) });
    const { runtime, time, alice, bob, settled } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    runtime.leaseChanged("lost");
    expect(runtime.stage).toBe("saving");
    // An earlier attempt of ours had committed: the results are saved, never reported lost.
    finish({ won: true, alreadyDone: true });
    await runtime.whenSaved();
    expect(runtime.stage).toBe("saved");
    expect(settled).toHaveBeenCalledOnce();
  });

  it("answers a retried finishing batch while the results are saved, without changing them", async () => {
    let finish: (answer: Transition) => void = () => undefined;
    const store = fakeStore({ finalizeRace: vi.fn(() => new Promise<Transition>((resolve) => (finish = resolve))) });
    const { runtime, time, alice, bob } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "ab"));
    runtime.keystrokes(bob.connection, batch(1, "ab"));
    expect(runtime.stage).toBe("saving");
    expect(runtime.keystrokes(bob.connection, batch(1, "ab"))).toMatchObject({ ok: true, result: { outcome: "duplicate", ackSeq: 1 } });
    finish(WON);
    await runtime.whenSaved();
  });

  it("stops racing when the start transition loses: the race was ended elsewhere", async () => {
    const store = fakeStore({ beginRacing: vi.fn(async (): Promise<Transition> => ({ won: false })) });
    const { runtime, time, settled } = setup({ store });
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    expect(runtime.stage).toBe("lost");
    expect(settled).toHaveBeenCalledOnce();
  });

  it("interrupts the race whose reducer throws (engine_error), and answers the batch without crashing", async () => {
    const { runtime, time, store, alice, bob, settled } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    runtime.keystrokes(alice.connection, batch(1, "a"));
    engine.failNext = true;
    expect(runtime.keystrokes(bob.connection, batch(1, "a"))).toEqual({ ok: false, error: "NO_RACE" });
    await time.advance(10);
    expect(store.interruptOwnRace).toHaveBeenCalledExactlyOnceWith(ownership, "engine_error");
    expect(runtime.stage).toBe("interrupted");
    // The last good state is interrupted in memory: Alice's keystroke is still there, nothing more.
    expect(runtime.state.phase).toBe("interrupted");
    expect(runtime.state.entrants[0]?.typed).toEqual(["a"]);
    expect(settled).toHaveBeenCalledOnce();
    expect(store.finalizeRace).not.toHaveBeenCalled();
  });

  it("interrupts only the race whose views fail (engine_error), keeping the server up", async () => {
    // Counters the engine never produces make its own measures throw.
    const good = created();
    const broken: RaceState = { ...good, entrants: good.entrants.map((entrant, index) => (index === 0 ? { ...entrant, counters: { correctInserts: 3, totalInserts: 1 } } : entrant)) };
    const { runtime, time, store, alice, settled, log } = setup({ state: broken });
    expect(() => runtime.start()).not.toThrow();
    await time.advance(10);
    expect(store.interruptOwnRace).toHaveBeenCalledExactlyOnceWith(ownership, "engine_error");
    expect(runtime.stage).toBe("interrupted");
    expect(settled).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("the engine failed"));
    expect(runtime.keystrokes(alice.connection, batch(1, "a"))).toEqual({ ok: false, error: "NO_RACE" });
  });

  describe("when the process stops", () => {
    it("interrupts a running race (server_stopped)", async () => {
      const { runtime, time, store } = setup();
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      expect(await runtime.shutdown(time.now() + 5_000)).toBe("interrupted");
      expect(store.interruptOwnRace).toHaveBeenCalledExactlyOnceWith(ownership, "server_stopped");
      expect(time.pending()).toBe(0);
    });

    it("tries once to save frozen results, and never interrupts a race whose results committed", async () => {
      let finalizeCalls = 0;
      const store = fakeStore({
        finalizeRace: vi.fn(() => (finalizeCalls++ === 0 ? Promise.reject(new Error("timeout")) : Promise.resolve<Transition>({ won: true, alreadyDone: true }))),
      });
      const { runtime, time, alice, bob } = setup({ store });
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      runtime.keystrokes(alice.connection, batch(1, "ab"));
      runtime.keystrokes(bob.connection, batch(1, "ab"));
      // The first attempt failed; the shutdown comes before its retry.
      await time.advance(10);
      expect(await runtime.shutdown(time.now() + 5_000)).toBe("finalised");
      expect(store.interruptOwnRace).not.toHaveBeenCalled();
    });

    it("never interrupts a race another process ended while its results were frozen", async () => {
      let calls = 0;
      // The save in flight hangs; the shutdown's own attempt learns the race ended elsewhere.
      const store = fakeStore({ finalizeRace: vi.fn(() => (calls++ === 0 ? new Promise<Transition>(() => undefined) : Promise.resolve<Transition>({ won: false }))) });
      const { runtime, time, alice, bob } = setup({ store });
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      runtime.keystrokes(alice.connection, batch(1, "ab"));
      runtime.keystrokes(bob.connection, batch(1, "ab"));
      expect(await runtime.shutdown(time.now() + 5_000)).toBe("left");
      expect(store.interruptOwnRace).not.toHaveBeenCalled();
    });

    it("sends nothing at all once the deadline has passed", async () => {
      const { runtime, time, store } = setup();
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      expect(await runtime.shutdown(time.now() - 1)).toBe("left");
      expect(store.interruptOwnRace).not.toHaveBeenCalled();
      expect(store.finalizeRace).not.toHaveBeenCalled();
    });

    it("stops the save's retries when it takes over, and writes once itself", async () => {
      let calls = 0;
      const store = fakeStore({ finalizeRace: vi.fn(() => (calls++ === 0 ? Promise.reject(new Error("timeout")) : Promise.resolve<Transition>(WON))) });
      const { runtime, time, alice, bob } = setup({ store });
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      runtime.keystrokes(alice.connection, batch(1, "ab"));
      runtime.keystrokes(bob.connection, batch(1, "ab"));
      await time.advance(10);
      expect(await runtime.shutdown(time.now() + 5_000)).toBe("finalised");
      await time.advance(30_000);
      // The failed attempt, then the shutdown's own: the save's retry never runs.
      expect(store.finalizeRace).toHaveBeenCalledTimes(2);
    });

    it("leaves a race to its lease when the database does not answer before the deadline", async () => {
      const store = fakeStore({
        finalizeRace: vi.fn(() => new Promise<Transition>(() => undefined)),
        interruptOwnRace: vi.fn(() => new Promise<Interruption>(() => undefined)),
      });
      const { runtime, time, alice, bob } = setup({ store });
      runtime.start();
      await time.advance(COUNTDOWN_MS + 1_000);
      runtime.keystrokes(alice.connection, batch(1, "ab"));
      runtime.keystrokes(bob.connection, batch(1, "ab"));
      const stopping = runtime.shutdown(time.now() + 5_000);
      await time.advance(5_000);
      expect(await stopping).toBe("left");
    });

    it("reports a saved race as finalised without writing again, and an interruption that lost to its save as finalised", async () => {
      const saved = setup();
      saved.runtime.start();
      await saved.time.advance(COUNTDOWN_MS + 1_000);
      saved.runtime.keystrokes(saved.alice.connection, batch(1, "ab"));
      saved.runtime.keystrokes(saved.bob.connection, batch(1, "ab"));
      await saved.runtime.whenSaved();
      expect(await saved.runtime.shutdown(saved.time.now() + 5_000)).toBe("finalised");
      expect(saved.store.interruptOwnRace).not.toHaveBeenCalled();

      const raced = setup({ store: fakeStore({ interruptOwnRace: vi.fn(async (): Promise<Interruption> => ({ won: false, resultsSaved: true })) }) });
      raced.runtime.start();
      expect(await raced.runtime.shutdown(raced.time.now() + 5_000)).toBe("finalised");
    });
  });
});

describe("RaceRuntime: lost connections, inactivity and the confirmed abandon (F-04.6)", () => {
  const entrant = (runtime: RaceRuntime, entrantId: string) => runtime.state.entrants.find((one) => one.entrantId === entrantId);
  /** The entrant's last tab leaves, as the race service reports it: gone from the followers first. */
  const leave = (runtime: RaceRuntime, followers: RaceConnection[], connection: RaceConnection) => {
    followers.splice(followers.indexOf(connection), 1);
    runtime.unfollow(connection.id, connection.accountId);
  };

  it("tells the engine when an entrant's last tab is gone, at the server's detection, and only then", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 1_000);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    // One tab among two: control moves, the entrant is still connected.
    leave(runtime, followers, alice.connection);
    expect(entrant(runtime, "e-alice")?.disconnectedAt).toBeUndefined();
    await time.advance(2_000);
    leave(runtime, followers, second.connection);
    expect(entrant(runtime, "e-alice")?.disconnectedAt).toBe(START + COUNTDOWN_MS + 3_000);
    expect(entrant(runtime, "e-bob")?.disconnectedAt).toBeUndefined();
  });

  it("resumes an entrant whose tab follows again within the grace, before that tab's first batch", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    leave(runtime, followers, alice.connection);
    // The grace includes its deadline (D-06).
    await time.advance(RESUME_GRACE_MS);
    const back = tab("tab-alice-back", ALICE.accountId);
    followers.push(back.connection);
    runtime.follow(back.connection);
    expect(entrant(runtime, "e-alice")).toMatchObject({ status: "racing" });
    expect(entrant(runtime, "e-alice")?.disconnectedAt).toBeUndefined();
    expect(runtime.keystrokes(back.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    await time.advance(RESUME_GRACE_MS + 1);
    expect(entrant(runtime, "e-alice")?.status).toBe("racing");
  });

  it("abandons an entrant gone beyond the grace, dated at its deadline, and a late tab cannot bring it back", async () => {
    const { runtime, time, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    leave(runtime, followers, alice.connection);
    // Its own timer, from nextDeadline: nothing else happens meanwhile.
    await time.advance(RESUME_GRACE_MS + 1);
    expect(entrant(runtime, "e-alice")).toMatchObject({ status: "abandoned", abandonReason: "disconnection", endedAt: START + COUNTDOWN_MS + RESUME_GRACE_MS });
    const late = tab("tab-alice-late", ALICE.accountId);
    followers.push(late.connection);
    runtime.follow(late.connection);
    expect(entrant(runtime, "e-alice")?.status).toBe("abandoned");
    expect(late.last<RaceSelfPayload>(RACE_SELF_EVENT)?.snapshot.status).toBe("abandoned");
  });

  it("starts the grace of an entrant that has no tab in the room at the start", async () => {
    const { runtime, time, bob, followers } = setup();
    followers.splice(followers.indexOf(bob.connection), 1);
    runtime.start();
    expect(entrant(runtime, "e-bob")?.disconnectedAt).toBe(START);
    expect(entrant(runtime, "e-alice")?.disconnectedAt).toBeUndefined();
    await time.advance(COUNTDOWN_MS + RESUME_GRACE_MS);
    expect(entrant(runtime, "e-bob")).toMatchObject({ status: "abandoned", abandonReason: "disconnection" });
  });

  it("shows an idle entrant inactive, lets « Je suis là » or a keystroke reset it, and abandons it at 120 s otherwise", async () => {
    const { runtime, time, alice, bob, spectator } = setup({ state: created("abc", null) });
    runtime.start();
    await time.advance(COUNTDOWN_MS + INACTIVITY_WARNING_MS);
    const progress = () => spectator.last<RaceProgressPayload>(RACE_PROGRESS_EVENT)?.broadcast.entrants.find((one) => one.entrantId === "e-alice");
    await time.advance(250);
    expect(progress()?.inactive).toBe(true);
    expect(runtime.present(alice.connection)).toBe("ok");
    await time.advance(250);
    expect(progress()?.inactive).toBe(false);
    expect(entrant(runtime, "e-alice")?.lastActivityAt).toBe(START + COUNTDOWN_MS + INACTIVITY_WARNING_MS + 250);
    // Bob never reacts: an abandon for inactivity, dated at its deadline, while Alice still races.
    await time.advance(INACTIVITY_ABANDON_MS - INACTIVITY_WARNING_MS);
    expect(entrant(runtime, "e-bob")).toMatchObject({ status: "abandoned", abandonReason: "inactivity", endedAt: START + COUNTDOWN_MS + INACTIVITY_ABANDON_MS });
    expect(entrant(runtime, "e-alice")?.status).toBe("racing");
    expect(runtime.keystrokes(alice.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    expect(runtime.present(bob.connection)).toBe("ok");
    expect(entrant(runtime, "e-bob")?.status).toBe("abandoned");
  });

  it("abandons on the entrant's confirmed request, from any of its tabs, and every tab learns it reliably", async () => {
    const { runtime, time, alice, bob, spectator, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS + 500);
    const second = tab("tab-alice-2", ALICE.accountId);
    followers.push(second.connection);
    runtime.follow(second.connection);
    expect(runtime.abandon(second.connection)).toBe("ok");
    expect(entrant(runtime, "e-alice")).toMatchObject({ status: "abandoned", abandonReason: "voluntary" });
    for (const one of [alice, second]) {
      const last = one.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1);
      expect(last).toMatchObject({ volatile: false, payload: { snapshot: { status: "abandoned" } } });
    }
    expect(runtime.abandon(spectator.connection)).toBe("NOT_AN_ENTRANT");
    expect(runtime.present(spectator.connection)).toBe("NOT_AN_ENTRANT");
    // Again: the engine ignores it, and the answer stays the same.
    expect(runtime.abandon(alice.connection)).toBe("ok");
    expect(runtime.keystrokes(alice.connection, batch(1, "a"))).toMatchObject({ ok: true, result: { outcome: "refused", reason: "ENTRANT_TERMINAL" } });
    expect(entrant(runtime, "e-bob")?.status).toBe("racing");
    expect(bob.count(RACE_SELF_EVENT)).toBe(1);
  });

  it("tells an idle entrant's tabs, reliably and with the reason, when the engine abandons it at 120 s (D-17)", async () => {
    const { runtime, time, bob, followers } = setup({ state: created("abc", null) });
    const bobTwo = tab("tab-bob-2", BOB.accountId);
    followers.push(bobTwo.connection);
    runtime.start();
    await time.advance(COUNTDOWN_MS + INACTIVITY_ABANDON_MS + 1);
    expect(entrant(runtime, "e-bob")).toMatchObject({ status: "abandoned", abandonReason: "inactivity" });
    for (const one of [bob, bobTwo]) {
      const last = one.received.filter((message) => message.event === RACE_SELF_EVENT).at(-1);
      expect(last).toMatchObject({ volatile: false, payload: { snapshot: { status: "abandoned" }, abandonReason: "inactivity" } });
    }
  });

  it("never resumes a lost entrant when another account's tab follows the room", async () => {
    const { runtime, time, bob, spectator, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    leave(runtime, followers, bob.connection);
    const lostAt = entrant(runtime, "e-bob")?.disconnectedAt;
    leave(runtime, followers, spectator.connection);
    followers.push(spectator.connection);
    runtime.follow(spectator.connection);
    const aliceTwo = tab("tab-alice-2", ALICE.accountId);
    followers.push(aliceTwo.connection);
    runtime.follow(aliceTwo.connection);
    expect(entrant(runtime, "e-bob")?.disconnectedAt).toBe(lostAt);
    await time.advance(RESUME_GRACE_MS + 1);
    expect(entrant(runtime, "e-bob")).toMatchObject({ status: "abandoned", abandonReason: "disconnection" });
  });

  it("still resumes a lost entrant that comes back after another account's tab followed the room", async () => {
    const { runtime, time, bob, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    leave(runtime, followers, bob.connection);
    const aliceTwo = tab("tab-alice-2", ALICE.accountId);
    followers.push(aliceTwo.connection);
    runtime.follow(aliceTwo.connection);
    await time.advance(10_000);
    const back = tab("tab-bob-back", BOB.accountId);
    followers.push(back.connection);
    runtime.follow(back.connection);
    expect(entrant(runtime, "e-bob")?.disconnectedAt).toBeUndefined();
    await time.advance(RESUME_GRACE_MS + 1);
    expect(entrant(runtime, "e-bob")?.status).toBe("racing");
  });

  it("tells nothing more to an entrant already terminal that asks to abandon again", async () => {
    const { runtime, time, alice } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    expect(runtime.abandon(alice.connection)).toBe("ok");
    const told = alice.count(RACE_SELF_EVENT);
    expect(runtime.abandon(alice.connection)).toBe("ok");
    expect(alice.count(RACE_SELF_EVENT)).toBe(told);
    expect(alice.last<RaceSelfPayload>(RACE_SELF_EVENT)).toMatchObject({ snapshot: { status: "abandoned" }, abandonReason: "voluntary" });
  });

  it("takes neither « Je suis là » nor an abandon while the lease is suspended or once the race no longer runs here", async () => {
    const { runtime, time, lease, alice, followers } = setup();
    runtime.start();
    await time.advance(COUNTDOWN_MS);
    lease.set("suspended");
    expect(runtime.present(alice.connection)).toBe("SUSPENDED");
    expect(runtime.abandon(alice.connection)).toBe("SUSPENDED");
    lease.set("held");
    await runtime.shutdown();
    expect(runtime.abandon(alice.connection)).toBe("NO_RACE");
    // Closing every socket after a shutdown tells the engine nothing.
    const revision = runtime.state.revision;
    leave(runtime, followers, alice.connection);
    expect(entrant(runtime, "e-alice")?.disconnectedAt).toBeUndefined();
    expect(runtime.state.revision).toBe(revision);
  });
});
