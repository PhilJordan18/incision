import { MAX_BATCH_EVENTS } from "@incision/domain";
import { describe, expect, it } from "vitest";
import type { EntrantSnapshotPayload, RaceSelfPayload } from "./protocol";
import { type SentBatch, TypingSession } from "./typing-session";

const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const TARGET = ["a", "b", "c", "d"];

function snapshot(change: Partial<EntrantSnapshotPayload> = {}): EntrantSnapshotPayload {
  return {
    raceId: RACE,
    entrantId: "e-alice",
    textVersion: 0,
    target: TARGET,
    typed: [],
    pendingError: false,
    ackSeq: 0,
    status: "racing",
    counters: { correctInserts: 0, totalInserts: 0 },
    ...change,
  };
}

const self = (change: Partial<EntrantSnapshotPayload> = {}, control: RaceSelfPayload["control"] = "controlling"): RaceSelfPayload => ({
  snapshot: snapshot(change),
  measures: { netWpm: 0, accuracy: 0 },
  control,
});

const insert = (grapheme: string) => ({ type: "insert" as const, grapheme });

/** The session against a scripted server: each sent batch waits for `answer` or `fail`. */
function harness() {
  let now = 0;
  const timers: { at: number; callback: () => void }[] = [];
  const sent: { batch: SentBatch; resolve: (answer: unknown) => void; reject: (error: Error) => void }[] = [];
  let changes = 0;
  let connected = true;
  const session = new TypingSession({
    raceId: RACE,
    errorMode: "mandatory",
    send: (batch) => new Promise((resolve, reject) => sent.push({ batch, resolve, reject })),
    connected: () => connected,
    now: () => now,
    schedule: (callback, delayMs) => {
      const timer = { at: now + delayMs, callback };
      timers.push(timer);
      return () => void timers.splice(timers.indexOf(timer), 1);
    },
    onChange: () => {
      changes += 1;
    },
  });
  const settle = async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await Promise.resolve();
    }
  };
  return {
    session,
    sent,
    changes: () => changes,
    disconnect: () => {
      connected = false;
    },
    reconnect: () => {
      connected = true;
    },
    async advance(ms: number) {
      const target = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (due === undefined || due.at > target) {
          break;
        }
        timers.shift();
        now = due.at;
        due.callback();
        await settle();
      }
      now = target;
      await settle();
    },
    async answer(index: number, answer: unknown) {
      sent[index]?.resolve(answer);
      await settle();
    },
    async fail(index: number) {
      sent[index]?.reject(new Error("timeout"));
      await settle();
    },
  };
}

const applied = (seq: number, typed: string[], change: Partial<EntrantSnapshotPayload> = {}) => ({
  ok: true,
  result: { outcome: "applied", seq, ackSeq: seq, textVersion: 0 },
  self: self({ typed, ackSeq: seq, ...change }),
});

describe("TypingSession", () => {
  it("takes no keystroke before the server's snapshot, nor in a tab that observes", () => {
    const { session, sent } = harness();
    session.type(insert("a"));
    expect(session.block).toBe("waiting");
    session.receive(self({}, "observing"));
    session.type(insert("a"));
    expect(session.block).toBe("observing");
    expect(sent).toHaveLength(0);
  });

  it("keeps one batch in flight, gathers the keystrokes meanwhile, and sends them together after the answer", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    session.type(insert("b"));
    session.type(insert("c"));
    expect(sent.map(({ batch }) => batch)).toEqual([{ raceId: RACE, seq: 1, textVersion: 0, events: [insert("a")] }]);
    // Shown at once on top of the snapshot, with the engine's own marks.
    expect(session.view()).toEqual({ target: TARGET, typed: ["a", "b", "c"], marks: ["correct", "correct", "correct"], pendingError: false, status: "racing", totalInserts: 0 });
    await answer(0, applied(1, ["a"]));
    await advance(110);
    expect(sent[1]?.batch).toEqual({ raceId: RACE, seq: 2, textVersion: 0, events: [insert("b"), insert("c")] });
  });

  it("never sends more than ten batches a second, nor more than MAX_BATCH_EVENTS events in one", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self({ target: Array.from({ length: 200 }, () => "a") }));
    for (let index = 0; index < 100; index += 1) {
      session.type(insert("a"));
    }
    await answer(0, applied(1, ["a"], { target: Array.from({ length: 200 }, () => "a") }));
    expect(sent).toHaveLength(1);
    // 110 ms apart: a margin under the server's ten-per-second window.
    await advance(109);
    expect(sent).toHaveLength(1);
    await advance(1);
    expect(sent[1]?.batch.events).toHaveLength(MAX_BATCH_EVENTS);
  });

  it("rebuilds from the snapshot after a resync or a refusal, dropping what was not applied", async () => {
    const { session, sent, answer } = harness();
    session.receive(self());
    session.type(insert("x"));
    session.type(insert("a"));
    // Mandatory correction: the wrong grapheme is never typed; the expected one shows in error.
    expect(session.view()).toMatchObject({ typed: ["a"], pendingError: false });
    await answer(0, { ok: true, result: { outcome: "refused", seq: 1, reason: "IMPLAUSIBLE", snapshot: snapshot() }, self: self() });
    expect(session.view()).toEqual({ target: TARGET, typed: [], marks: [], pendingError: false, status: "racing", totalInserts: 0 });
    expect(sent).toHaveLength(1);
  });

  it("shows the snapshot alone when an event is one the server would refuse", () => {
    const { session } = harness();
    session.receive(self({ typed: ["a"], ackSeq: 1 }));
    session.type(insert("ab"));
    expect(session.view()).toEqual({ target: TARGET, typed: ["a"], marks: ["correct"], pendingError: false, status: "racing", totalInserts: 0 });
  });

  it("sends the same batch again after a lost answer, and the server answers duplicate", async () => {
    const { session, sent, fail, advance, answer } = harness();
    session.receive(self());
    session.type(insert("a"));
    await fail(0);
    await advance(1_000);
    expect(sent[1]?.batch).toBe(sent[0]?.batch);
    await answer(1, { ok: true, result: { outcome: "duplicate", seq: 1, ackSeq: 1 }, self: self({ typed: ["a"], ackSeq: 1 }) });
    expect(session.view()?.typed).toEqual(["a"]);
  });

  it("after a reconnection, counts the batch in flight as applied only if the snapshot's ackSeq reached it", async () => {
    const applied = harness();
    applied.session.receive(self());
    applied.session.type(insert("a"));
    applied.session.receive(self({ typed: ["a"], ackSeq: 1 }));
    applied.session.type(insert("b"));
    await applied.advance(110);
    expect(applied.sent.map(({ batch }) => batch.seq)).toEqual([1, 2]);

    const lost = harness();
    lost.session.receive(self());
    lost.session.type(insert("a"));
    lost.disconnect();
    await lost.fail(0);
    // Offline: nothing is resent on a timer; the reconnection's snapshot decides.
    await lost.advance(10_000);
    expect(lost.sent).toHaveLength(1);
    // The new socket connects; its first snapshot says the batch was not applied.
    lost.reconnect();
    lost.session.receive(self());
    await lost.advance(0);
    // Resent unchanged, as the only copy, and still shown on top of the snapshot.
    expect(lost.sent[1]?.batch).toBe(lost.sent[0]?.batch);
    expect(lost.session.view()?.typed).toEqual(["a"]);
  });

  it("stops typing here when another tab takes the input, and when the race has no place for this tab", async () => {
    const moved = harness();
    moved.session.receive(self());
    moved.session.type(insert("a"));
    await moved.answer(0, { ok: false, error: "NOT_CONTROLLING" });
    expect(moved.session.block).toBe("observing");
    expect(moved.session.view()?.typed).toEqual([]);

    const gone = harness();
    gone.session.receive(self());
    gone.session.type(insert("a"));
    await gone.answer(0, { ok: false, error: "NO_RACE" });
    expect(gone.session.block).toBe("reload");
  });

  it("recovers from a wait for the server once its next state arrives, and settles the batch in flight", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    await answer(0, { ok: false, error: "SUSPENDED" });
    // The resend reaches a server that does not follow this tab yet (a reconnection being admitted).
    await advance(1_000);
    await answer(1, { ok: false, error: "NO_RACE" });
    expect(session.block).toBe("reload");
    session.type(insert("b"));
    // The watch completes: the server's state ends the wait; the batch was not applied, so it goes again.
    session.receive(self());
    expect(session.block).toBeUndefined();
    // Resent at the usual spacing after the last send.
    await advance(109);
    expect(sent).toHaveLength(2);
    await advance(1);
    expect(sent[2]?.batch).toBe(sent[0]?.batch);
    expect(session.view()?.typed).toEqual(["a"]);
  });

  it("drops what an observing tab gathered, so nothing stale leaves once it types again", async () => {
    const { session, sent, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    session.type(insert("b"));
    session.receive(self({}, "observing"));
    session.receive(self({}, "controlling"));
    await advance(1_000);
    // Only the first batch ever left; "b", typed before control moved, is gone.
    expect(sent.map(({ batch }) => batch.events)).toEqual([[insert("a")]]);
  });

  it("resends sooner after the server's rate limit than after a lost answer", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    await answer(0, { ok: false, error: "RATE_LIMITED" });
    await advance(299);
    expect(sent).toHaveLength(1);
    await advance(1);
    expect(sent[1]?.batch).toBe(sent[0]?.batch);
  });

  it("drops what it gathered when the server says another tab types, and sends nothing stale later", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    session.type(insert("b"));
    await answer(0, { ok: false, error: "NOT_CONTROLLING" });
    session.receive(self({}, "controlling"));
    await advance(1_000);
    expect(sent).toHaveLength(1);
  });

  it("takes no state from the server once the page closed it", () => {
    const { session, sent } = harness();
    session.receive(self());
    session.close();
    session.receive(self({ typed: ["a"], ackSeq: 1 }));
    session.type(insert("b"));
    expect(session.block).toBe("over");
    expect(session.view()?.typed).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing and ignores late answers once the page closed it", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    session.type(insert("b"));
    session.close();
    await answer(0, applied(1, ["a"]));
    await advance(1_000);
    expect(sent).toHaveLength(1);
    expect(session.block).toBe("over");
  });

  it("waits while the server cannot confirm its ownership, then sends the same batch again", async () => {
    const { session, sent, answer, advance } = harness();
    session.receive(self());
    session.type(insert("a"));
    await answer(0, { ok: false, error: "SUSPENDED" });
    expect(session.block).toBe("suspended");
    await advance(1_000);
    expect(sent[1]?.batch).toBe(sent[0]?.batch);
    await answer(1, applied(1, ["a"]));
    expect(session.block).toBeUndefined();
  });

  it("ignores an answer to a batch that is no longer in flight, and a snapshot of another race", async () => {
    const { session, sent, answer, changes } = harness();
    session.receive(self());
    session.type(insert("a"));
    session.receive(self({ typed: ["a"], ackSeq: 1 }));
    const before = changes();
    await answer(0, applied(1, ["a", "b"]));
    expect(changes()).toBe(before);
    session.receive({ ...self(), snapshot: snapshot({ raceId: "00000000-0000-4000-8000-000000000000", typed: ["z"] }) });
    expect(session.view()?.typed).toEqual(["a"]);
    expect(sent).toHaveLength(1);
  });

  it("shows the inserts the server counted, never predicted ones", async () => {
    const { session, answer } = harness();
    session.receive(self());
    session.type(insert("x"));
    expect(session.view()?.totalInserts).toBe(0);
    await answer(0, { ok: true, result: { outcome: "applied", seq: 1, ackSeq: 1, textVersion: 0 }, self: self({ ackSeq: 1, pendingError: true, counters: { correctInserts: 0, totalInserts: 1 } }) });
    expect(session.view()?.totalInserts).toBe(1);
  });

  it("is over once the entrant finished", () => {
    const { session } = harness();
    session.receive(self({ typed: TARGET, status: "finished", ackSeq: 1 }));
    expect(session.block).toBe("over");
  });

  it("keeps why the entrant abandoned, from a pushed state or a batch's answer (D-06, D-17)", async () => {
    const { session } = harness();
    session.receive(self());
    expect(session.abandonReason).toBeUndefined();
    session.receive({ ...self({ status: "abandoned" }), abandonReason: "disconnection" });
    expect(session.abandonReason).toBe("disconnection");

    const other = harness();
    other.session.receive(self());
    other.session.type(insert("a"));
    expect(other.sent).toHaveLength(1);
    // The batch came after an inactivity deadline: refused, with the entrant's terminal state.
    await other.answer(0, {
      ok: true,
      result: { outcome: "refused", seq: 1, reason: "ENTRANT_TERMINAL" },
      self: { ...self({ status: "abandoned" }), abandonReason: "inactivity" },
    });
    expect(other.session.abandonReason).toBe("inactivity");
    expect(other.session.block).toBe("over");
  });
});
