import { describe, expect, it } from "vitest";
import { computeMeasures } from "../measures/compute";
import { asEntrantId, asRaceId, type EntrantId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, type Instant } from "../time";
import { createRace } from "./create";
import { measuredElapsed } from "./elapsed";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import { RACE_EXAMPLES } from "./race.examples";
import { reduceRace } from "./reduce";
import type { EntrantState, InputEvent, RaceEvent, RaceOutput, RacePhase, RaceState } from "./types";
import { toRaceBroadcast } from "./views";

const ALICE = EXAMPLE_ENTRANT;
const BOB = asEntrantId("bob");
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);

function runner(entrantId: EntrantId, overrides: Partial<EntrantState> = {}): EntrantState {
  return {
    entrantId,
    kind: "human",
    target: toGraphemes("ab"),
    textVersion: 0,
    typed: [],
    pendingError: false,
    counters: { correctInserts: 0, totalInserts: 0 },
    missedKeys: {},
    ackSeq: 0,
    status: "racing",
    ...overrides,
  };
}

function race(overrides: Partial<RaceState> = {}): RaceState {
  return {
    raceId: EXAMPLE_RACE,
    revision: 4,
    phase: "racing",
    errorMode: "free",
    timeLimit: null,
    countdownAt: at(-3_000),
    startsAt: at(0),
    clock: at(0),
    text: toGraphemes("ab"),
    entrants: [runner(ALICE), runner(BOB)],
    ...overrides,
  };
}

const insert = (grapheme: string): InputEvent => ({ type: "insert", grapheme });

function keystrokes(entrantId: EntrantId, seq: number, events: readonly InputEvent[], sinceStart: number, raceId = EXAMPLE_RACE): RaceEvent {
  return { type: "keystrokes", batch: { raceId, entrantId, seq, textVersion: 0, events }, now: at(sinceStart) };
}

const tick = (sinceStart: number): RaceEvent => ({ type: "tick", now: at(sinceStart) });
const abandon = (entrantId: EntrantId, sinceStart: number): RaceEvent => ({ type: "abandon", entrantId, now: at(sinceStart) });
const interrupt = (sinceStart: number): RaceEvent => ({ type: "interrupt", now: at(sinceStart) });

/** A plain deep copy (these inputs hold only strings, numbers, arrays and records). */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deeply frozen, so any mutation of an input throws. */
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      frozen((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function entrantOf(output: RaceOutput, entrantId: EntrantId): EntrantState | undefined {
  return output.state.entrants.find((entrant) => entrant.entrantId === entrantId);
}

const aliceDone = runner(ALICE, { typed: ["a", "b"], ackSeq: 1, status: "finished", endedAt: at(2_000), counters: { correctInserts: 2, totalInserts: 2 } });
const bobHalfway = runner(BOB, { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } });
const thirtySeconds = asDuration(30_000);

describe("reduceRace: the contract examples (F-04.1)", () => {
  it.each(RACE_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    const state = frozen(copy(example.input.state));
    const output = reduceRace(state, frozen(copy(example.input.event)));
    const { expected } = example;
    expect(output.state.phase).toBe(expected.phase);
    expect(output.changed).toBe(expected.changed);
    expect(output.state.revision).toBe(state.revision + (expected.changed ? 1 : 0));
    if (expected.keystrokes !== undefined) {
      expect(output.keystrokes).toMatchObject(expected.keystrokes);
    }
    expect(output.ignored).toBe(expected.ignored);
    for (const [entrantId, status] of expected.statuses ?? []) {
      expect(entrantOf(output, entrantId)?.status).toBe(status);
    }
    // An absent ranking means the event produced no results.
    expect(output.ended?.results.map((result) => result.entrantId)).toEqual(expected.ranking);
    if (expected.endedAt !== undefined) {
      expect(output.state.endedAt).toBe(expected.endedAt);
      expect(output.ended?.endedAt ?? expected.endedAt).toBe(expected.endedAt);
    }
    for (const [entrantId, elapsed] of expected.elapsed ?? []) {
      expect(output.ended?.results.find((result) => result.entrantId === entrantId)?.elapsed).toBe(elapsed);
    }
    if (expected.nextDeadline !== undefined) {
      expect(output.nextDeadline).toBe(expected.nextDeadline);
    }
    if (state.phase === "ended" || state.phase === "interrupted") {
      expect(output.state).toBe(state);
    }
  });
});

describe("reduceRace: time and deadlines", () => {
  it("handles an event earlier than the clock at the clock, which never moves back", () => {
    const output = reduceRace(race({ clock: at(5_000) }), tick(4_000));
    expect(output.state.clock).toBe(at(5_000));
    expect(reduceRace(race({ clock: at(5_000) }), tick(6_000)).state.clock).toBe(at(6_000));
  });

  it("an abandon earlier than the clock ends at the clock, not before", () => {
    const output = reduceRace(race({ clock: at(5_000) }), abandon(BOB, 4_000));
    expect(entrantOf(output, BOB)?.endedAt).toBe(at(5_000));
  });

  it("moves the clock without a revision when nothing public changes", () => {
    const output = reduceRace(race(), tick(1_000));
    expect(output).toMatchObject({ changed: false, state: { revision: 4, clock: at(1_000) } });
  });

  it("starts, then times out, in one late tick: one revision, results at the deadline", () => {
    const state = race({ phase: "countdown", clock: at(-3_000), timeLimit: thirtySeconds });
    const output = reduceRace(state, tick(45_000));
    expect(output.changed).toBe(true);
    expect(output.state).toMatchObject({ phase: "ended", endedAt: at(30_000), revision: 5, clock: at(45_000) });
    expect(output.state.entrants.map((entrant) => [entrant.status, entrant.endedAt])).toEqual([
      ["timedOut", at(30_000)],
      ["timedOut", at(30_000)],
    ]);
    expect(output.ended?.results.map((result) => result.elapsed)).toEqual([thirtySeconds, thirtySeconds]);
    expect(output.nextDeadline).toBeUndefined();
  });

  it("everyone gone during the countdown ends at startsAt, even with a time limit and a late tick", () => {
    const gone = (entrantId: EntrantId, sinceStart: number): EntrantState => runner(entrantId, { status: "abandoned", abandonReason: "voluntary", endedAt: at(sinceStart) });
    const state = race({ phase: "countdown", clock: at(-1_000), timeLimit: thirtySeconds, entrants: [gone(ALICE, -2_000), gone(BOB, -1_000)] });
    const output = reduceRace(state, tick(60_000));
    expect(output.state).toMatchObject({ phase: "ended", endedAt: at(0), revision: 5 });
    expect(output.ended?.results.map((result) => [result.entrantId, result.elapsed, result.measures])).toEqual([
      [ALICE, 0, { netWpm: 0, rawWpm: 0, accuracy: 0 }],
      [BOB, 0, { netWpm: 0, rawWpm: 0, accuracy: 0 }],
    ]);
  });

  it("never ends from the countdown, even when everyone is gone", () => {
    const output = reduceRace(race({ phase: "countdown", clock: at(-3_000), entrants: [runner(ALICE, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_500) }), runner(BOB)] }), abandon(BOB, -1));
    expect(output).toMatchObject({ changed: true, nextDeadline: at(0), state: { phase: "countdown" } });
    expect(output.ended).toBeUndefined();
  });

  it("accepts a finishing batch 1 ms before the time limit, and ends the race at that instant", () => {
    const output = reduceRace(race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), keystrokes(BOB, 2, [insert("b")], 29_999));
    expect(output.keystrokes).toMatchObject({ outcome: "applied" });
    expect(output.state).toMatchObject({ phase: "ended", endedAt: at(29_999) });
    expect(output.ended?.results.map((result) => [result.entrantId, result.status])).toEqual([
      [ALICE, "finished"],
      [BOB, "finished"],
    ]);
  });

  it("gives the start, then the time limit, as the next deadline, and nothing without a limit", () => {
    expect(reduceRace(race({ phase: "countdown", clock: at(-3_000), timeLimit: thirtySeconds }), tick(-2_000)).nextDeadline).toBe(at(0));
    expect(reduceRace(race({ timeLimit: thirtySeconds }), tick(1_000)).nextDeadline).toBe(at(30_000));
    expect(reduceRace(race(), tick(1_000)).nextDeadline).toBeUndefined();
    expect(reduceRace(race({ timeLimit: thirtySeconds }), tick(30_000)).nextDeadline).toBeUndefined();
  });

  it("refuses an event whose now is not a valid instant, a programming error", () => {
    expect(() => reduceRace(race(), { type: "tick", now: 1.5 as Instant })).toThrow(RangeError);
    expect(() => reduceRace(race({ phase: "ended", endedAt: at(0) }), { type: "tick", now: -1 as Instant })).toThrow(RangeError);
  });
});

describe("reduceRace: events", () => {
  it("checks the race before the entrant, on a final race too", () => {
    for (const state of [race(), race({ phase: "ended", endedAt: at(0) })]) {
      expect(reduceRace(state, keystrokes(asEntrantId("mallory"), 1, [insert("a")], 1_000, asRaceId("race-0"))).keystrokes).toEqual({ outcome: "refused", seq: 1, reason: "WRONG_RACE" });
      expect(reduceRace(state, keystrokes(asEntrantId("mallory"), 1, [insert("a")], 1_000)).keystrokes).toEqual({ outcome: "refused", seq: 1, reason: "UNKNOWN_ENTRANT" });
    }
  });

  it("answers a retry of the last batch with duplicate after the end, and changes nothing", () => {
    const ended = race({ phase: "ended", endedAt: at(3_000), clock: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000), ackSeq: 2 })] });
    const output = reduceRace(ended, keystrokes(BOB, 2, [insert("b")], 4_000));
    expect(output).toEqual({ state: ended, changed: false, keystrokes: { outcome: "duplicate", seq: 2, ackSeq: 2 } });
    expect(output.state).toBe(ended);
  });

  it("applies a batch with no public change without a revision: a wrong insert in mandatory correction", () => {
    const state = race({ errorMode: "mandatory" });
    const output = reduceRace(state, keystrokes(BOB, 1, [insert("x")], 1_000));
    expect(output.keystrokes).toMatchObject({ outcome: "applied", ackSeq: 1 });
    expect(output.changed).toBe(false);
    expect(output.state.revision).toBe(4);
    expect(entrantOf(output, BOB)).toMatchObject({ pendingError: true, counters: { correctInserts: 0, totalInserts: 1 }, ackSeq: 1 });
  });

  it("records a confirmed abandon as voluntary, at the handled instant", () => {
    const output = reduceRace(race(), abandon(BOB, 1_500));
    expect(entrantOf(output, BOB)).toMatchObject({ status: "abandoned", abandonReason: "voluntary", endedAt: at(1_500) });
    expect(output).toMatchObject({ changed: true, state: { revision: 5 } });
  });

  it("ignores an abandon: unknown entrant first, then race over, then entrant terminal", () => {
    const ended = race({ phase: "ended", endedAt: at(3_000), clock: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000) })] });
    expect(reduceRace(ended, abandon(asEntrantId("mallory"), 4_000)).ignored).toBe("UNKNOWN_ENTRANT");
    expect(reduceRace(ended, abandon(ALICE, 4_000)).ignored).toBe("RACE_OVER");
    expect(reduceRace(race({ entrants: [aliceDone, runner(BOB)] }), abandon(ALICE, 4_000)).ignored).toBe("ENTRANT_TERMINAL");
    expect(reduceRace(race({ phase: "interrupted", endedAt: at(0) }), abandon(BOB, 4_000)).ignored).toBe("RACE_OVER");
  });

  it("interrupts during the countdown, with no result and no further deadline", () => {
    const output = reduceRace(race({ phase: "countdown", clock: at(-3_000) }), interrupt(-1_000));
    expect(output).toMatchObject({ changed: true, state: { phase: "interrupted", endedAt: at(-1_000), revision: 5 } });
    expect(output.ended).toBeUndefined();
    expect(output.nextDeadline).toBeUndefined();
    expect(output.state.entrants.map((entrant) => entrant.status)).toEqual(["racing", "racing"]);
  });

  it("an interrupt at the time limit comes too late: the race ends first and keeps its results (D-06)", () => {
    const output = reduceRace(race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), interrupt(30_000));
    expect(output.state).toMatchObject({ phase: "ended", endedAt: at(30_000) });
    expect(output.ended?.results.map((result) => result.entrantId)).toEqual([ALICE, BOB]);
  });

  it("returns a final race as is for every event, clock included", () => {
    for (const final of [race({ phase: "ended", endedAt: at(3_000), clock: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000) })] }), race({ phase: "interrupted", endedAt: at(1_000), clock: at(1_000) })]) {
      for (const event of [tick(9_000), interrupt(9_000), abandon(BOB, 9_000), keystrokes(BOB, 9, [insert("a")], 9_000)]) {
        const output = reduceRace(final, event);
        expect(output.state).toBe(final);
        expect(output.changed).toBe(false);
        expect(output.ended).toBeUndefined();
        expect(output.nextDeadline).toBeUndefined();
      }
    }
  });
});

describe("reduceRace: results", () => {
  it("computes each result from the counters over the measured elapsed time, ranked by COURSE-10", () => {
    const state = race({
      timeLimit: thirtySeconds,
      entrants: [
        runner(ALICE, { typed: ["a", "x"], ackSeq: 3, status: "finished", endedAt: at(12_000), counters: { correctInserts: 1, totalInserts: 3 }, missedKeys: { b: 2 } }),
        runner(BOB, { typed: ["a"], ackSeq: 1, status: "abandoned", abandonReason: "voluntary", endedAt: at(6_000), counters: { correctInserts: 1, totalInserts: 1 } }),
        runner(asEntrantId("carol"), { kind: "bot", typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { b: 1 } }),
      ],
    });
    const output = reduceRace(state, tick(31_000));
    expect(output.ended).toEqual({
      raceId: EXAMPLE_RACE,
      endedAt: at(30_000),
      results: [
        { entrantId: ALICE, kind: "human", rank: 1, status: "finished", elapsed: 12_000, position: 2, length: 2, counters: { correctInserts: 1, totalInserts: 3 }, errors: 2, measures: computeMeasures({ correctInserts: 1, totalInserts: 3 }, asDuration(12_000)), missedKeys: { b: 2 } },
        { entrantId: asEntrantId("carol"), kind: "bot", rank: 2, status: "timedOut", elapsed: 30_000, position: 1, length: 2, counters: { correctInserts: 1, totalInserts: 2 }, errors: 1, measures: computeMeasures({ correctInserts: 1, totalInserts: 2 }, thirtySeconds), missedKeys: { b: 1 } },
        { entrantId: BOB, kind: "human", rank: 3, status: "abandoned", abandonReason: "voluntary", elapsed: 6_000, position: 1, length: 2, counters: { correctInserts: 1, totalInserts: 1 }, errors: 0, measures: computeMeasures({ correctInserts: 1, totalInserts: 1 }, asDuration(6_000)), missedKeys: {} },
      ],
    });
  });

  it("breaks an exact tie by accuracy, computed from the counters, before the id", () => {
    // Alice finished first in id order, at the same instant as Bob, with a lower accuracy (2 of 3).
    const alice = runner(ALICE, { typed: ["a", "b"], ackSeq: 2, status: "finished", endedAt: at(2_000), counters: { correctInserts: 2, totalInserts: 3 }, missedKeys: { b: 1 } });
    const output = reduceRace(race({ clock: at(2_000), entrants: [alice, runner(BOB)] }), keystrokes(BOB, 1, [insert("a"), insert("b")], 2_000));
    expect(output.ended?.results.map((result) => [result.entrantId, result.measures.netWpm, result.measures.accuracy])).toEqual([
      [BOB, 12, 100],
      [ALICE, 12, (2 * 100) / 3],
    ]);
  });

  it("produces the results exactly once over a whole race", () => {
    const created = createRace({ raceId: EXAMPLE_RACE, text: "ab", errorMode: "free", timeLimit: null, participants: [{ entrantId: ALICE, kind: "human" }, { entrantId: BOB, kind: "bot" }], now: at(-3_000) });
    if (!created.ok) {
      throw new Error(created.reason);
    }
    const events = [tick(0), keystrokes(ALICE, 1, [insert("a"), insert("b")], 1_000), abandon(BOB, 2_000), tick(3_000), interrupt(4_000), keystrokes(ALICE, 1, [insert("a")], 5_000)];
    let state = created.race;
    const ends: RaceOutput["ended"][] = [];
    for (const event of events) {
      const output = reduceRace(state, event);
      if (output.ended !== undefined) {
        ends.push(output.ended);
      }
      state = output.state;
    }
    expect(ends.map((end) => end?.results.map((result) => [result.entrantId, result.rank]))).toEqual([
      [
        [ALICE, 1],
        [BOB, 2],
      ],
    ]);
    // The start, the finish and the end: three public changes.
    expect(state).toMatchObject({ phase: "ended", endedAt: at(2_000), revision: 3 });
  });
});

/** Small seeded generator (mulberry32), so the random scenarios replay identically. */
function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const ALLOWED: Readonly<Record<RacePhase, readonly RacePhase[]>> = {
  countdown: ["countdown", "racing", "ended", "interrupted"],
  racing: ["racing", "ended", "interrupted"],
  ended: ["ended"],
  interrupted: ["interrupted"],
};

/** What everyone in the room sees at `probe`, apart from the revision, as JSON. */
function publicView(state: RaceState, probe: Instant): string {
  return JSON.stringify({ ...toRaceBroadcast(state, probe), revision: undefined });
}

describe("reduceRace invariants over seeded random events", () => {
  it("holds over 300 races, and reaches every kind of end", { timeout: 30_000 }, () => {
    const random = seeded(41);
    const reached = new Set<string>();
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    for (let run = 0; run < 300; run += 1) {
      const ids = Array.from({ length: 2 + Math.floor(random() * 3) }, (_, index) => asEntrantId(`e${index}`));
      const created = createRace({
        raceId: EXAMPLE_RACE,
        text: "ab é",
        errorMode: random() < 0.5 ? "free" : "mandatory",
        timeLimit: random() < 0.5 ? null : thirtySeconds,
        participants: ids.map((entrantId, index) => ({ entrantId, kind: index === 0 || random() < 0.5 ? "human" : "bot" })),
        now: at(-3_000),
      });
      if (!created.ok) {
        throw new Error(created.reason);
      }
      let state = created.race;
      let now = -3_000;
      let ends = 0;
      for (let step = 0; step < 40; step += 1) {
        now = Math.max(-3_000, now + Math.floor(random() * 3_000) - 400);
        const roll = random();
        let event: RaceEvent;
        if (roll < 0.2) {
          event = tick(now);
        } else if (roll < 0.25) {
          event = abandon(pick([...ids, asEntrantId("mallory")]), now);
        } else if (roll < 0.26) {
          event = interrupt(now);
        } else {
          const entrant = pick(state.entrants);
          const seq = random() < 0.1 ? entrant.ackSeq : entrant.ackSeq + 1;
          const events = Array.from({ length: 1 + Math.floor(random() * 3) }, (): InputEvent => {
            if (random() < 0.15) {
              return { type: "deleteBackward" };
            }
            return insert(random() < 0.7 ? (entrant.target[entrant.typed.length] ?? "a") : pick(["a", "b", "x", " "]));
          });
          const raceId = random() < 0.03 ? asRaceId("race-0") : EXAMPLE_RACE;
          const entrantId = random() < 0.03 ? asEntrantId("mallory") : entrant.entrantId;
          event = keystrokes(entrantId, seq, events, now, raceId);
        }
        const before = frozen(state);
        const output = reduceRace(before, event);
        const after = output.state;
        const final = before.phase === "ended" || before.phase === "interrupted";
        reached.add(`${before.phase}->${after.phase}`);
        if (output.keystrokes !== undefined) {
          reached.add(output.keystrokes.outcome === "refused" ? output.keystrokes.reason : output.keystrokes.outcome);
        }
        if (output.ignored !== undefined) {
          reached.add(`ignored ${output.ignored}`);
        }
        if (event.now < before.clock) {
          reached.add("time going back");
        }
        expect(ALLOWED[before.phase]).toContain(after.phase);
        expect(output.keystrokes !== undefined).toBe(event.type === "keystrokes");
        if (final) {
          expect(after).toBe(before);
          expect(output.changed).toBe(false);
          expect(output.ended).toBeUndefined();
          expect(output.nextDeadline).toBeUndefined();
          continue;
        }
        expect(after.clock).toBe(Math.max(before.clock, event.now));
        // Both views at one instant after every end, so only the reducer's changes can differ.
        const probe = asInstant(after.clock + 3_600_000);
        expect(output.changed).toBe(publicView(before, probe) !== publicView(after, probe));
        expect(after.revision).toBe(before.revision + (output.changed ? 1 : 0));
        if (after.phase === "ended" && before.phase === "countdown") {
          expect(after.clock).toBeGreaterThanOrEqual(after.startsAt);
        }
        before.entrants.forEach((entrant, index) => {
          // A terminal result is immutable (state machine §3).
          if (entrant.status !== "racing") {
            expect(after.entrants[index]).toBe(entrant);
          }
        });
        const deadline = after.phase === "countdown" ? after.startsAt : after.phase === "racing" && after.timeLimit !== null ? after.startsAt + after.timeLimit : undefined;
        expect(output.nextDeadline).toBe(deadline);
        if (output.nextDeadline !== undefined) {
          expect(output.nextDeadline).toBeGreaterThan(after.clock);
        }
        expect(output.ended !== undefined).toBe(after.phase === "ended");
        if (output.ended !== undefined) {
          ends += 1;
          reached.add(after.entrants.some((entrant) => entrant.status === "timedOut") ? "end by time limit" : "end with everyone terminal");
          const { results } = output.ended;
          expect(output.ended.endedAt).toBe(after.endedAt);
          expect(results.map((result) => result.rank)).toEqual(results.map((_, index) => index + 1));
          expect(new Set(results.map((result) => result.entrantId))).toEqual(new Set(ids));
          for (const result of results) {
            const entrant = after.entrants.find((candidate) => candidate.entrantId === result.entrantId);
            expect(entrant?.status).toBe(result.status);
            expect(result.elapsed).toBe(measuredElapsed(after.startsAt, output.ended.endedAt, entrant?.endedAt));
            expect(result.measures).toEqual(computeMeasures(result.counters, result.elapsed));
          }
          if (after.timeLimit !== null) {
            expect(output.ended.endedAt).toBeLessThanOrEqual(after.startsAt + after.timeLimit);
          }
        }
        state = after;
      }
      expect(ends).toBeLessThanOrEqual(1);
    }
    for (const outcome of ["countdown->racing", "countdown->interrupted", "racing->ended", "racing->interrupted", "ended->ended", "interrupted->interrupted", "end by time limit", "end with everyone terminal", "time going back", "applied", "duplicate", "NOT_RACING", "WRONG_RACE", "UNKNOWN_ENTRANT", "ignored UNKNOWN_ENTRANT", "ignored ENTRANT_TERMINAL", "ignored RACE_OVER"]) {
      expect([...reached]).toContain(outcome);
    }
  });
});
