import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asInstant, type Instant } from "../time";
import { measuredElapsed } from "./elapsed";
import { applyKeystrokes, toEntrantSnapshot } from "./keystrokes";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE, KEYSTROKE_EXAMPLES } from "./keystrokes.examples";
import { MAX_BATCH_EVENTS, maxPlausibleInserts } from "./limits";
import type { EntrantState, ErrorMode, InputEvent, KeystrokeBatch, KeystrokeContext, RacePhase, RaceState } from "./types";

const STARTS_AT = asInstant(1_000_000);
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);

function entrant(target: string, overrides: Partial<EntrantState> = {}): EntrantState {
  return {
    entrantId: EXAMPLE_ENTRANT,
    kind: "human",
    target: toGraphemes(target),
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

function batch(seq: number, events: readonly InputEvent[], textVersion = 0): KeystrokeBatch {
  return { raceId: EXAMPLE_RACE, entrantId: EXAMPLE_ENTRANT, seq, textVersion, events };
}

const insert = (grapheme: string): InputEvent => ({ type: "insert", grapheme });
const deleteBackward: InputEvent = { type: "deleteBackward" };
const context = (errorMode: ErrorMode, sinceStart: number, phase: RacePhase = "racing"): KeystrokeContext => ({
  errorMode,
  phase,
  startsAt: STARTS_AT,
  now: at(sinceStart),
});

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

/** Small seeded generator (mulberry32), so the random scenarios replay identically. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The outcome of a reply, with its reason when it has one. */
function outcomeOf(result: { readonly outcome: string; readonly reason?: string }): string {
  return result.reason ?? result.outcome;
}

describe("applyKeystrokes (F-04.4)", () => {
  it.each(KEYSTROKE_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    const { entrant: before, batch: sent, context: ctx } = example.input;
    const input = frozen(copy(before));
    const output = applyKeystrokes(input, frozen(copy(sent)), ctx);
    expect(output.result).toEqual(example.expected.result);
    expect(output.entrant).toEqual(example.expected.entrant);
    if (example.expected.result.outcome !== "applied") {
      // Not a copy: the very same object, so a refusal provably changes nothing.
      expect(output.entrant).toBe(input);
    }
  });

  const finished = entrant("ab", { typed: ["a", "b"], ackSeq: 2, status: "finished", endedAt: at(9_000), counters: { correctInserts: 2, totalInserts: 2 } });
  const sixtyFive = (last: InputEvent = insert("a")): InputEvent[] => [...Array.from({ length: MAX_BATCH_EVENTS }, () => insert("a")), last];
  it.each([
    ["phase before status", finished, batch(3, [insert("a")]), context("free", 1_000, "ended"), "NOT_RACING"],
    ["phase before the sequence gap", entrant("ab"), batch(2, [insert("a")]), context("free", 1_000, "ended"), "NOT_RACING"],
    ["status before the sequence gap", finished, batch(4, [insert("a")]), context("free", 1_000), "ENTRANT_TERMINAL"],
    ["sequence gap before text version", entrant("ab"), batch(2, [insert("a")], 1), context("free", 1_000), "OUT_OF_ORDER"],
    ["sequence gap before size", entrant("ab"), batch(2, sixtyFive()), context("free", 1_000), "OUT_OF_ORDER"],
    ["text version before size", entrant("ab"), batch(1, sixtyFive(), 1), context("free", 1_000), "TEXT_VERSION_CHANGED"],
    ["size before each input", entrant("a".repeat(100)), batch(1, sixtyFive(insert("ab"))), context("free", 60_000), "BATCH_TOO_LARGE"],
    ["each input before plausibility", entrant("a".repeat(100)), batch(1, [...Array.from({ length: 21 }, () => insert("a")), insert("ab")]), context("free", 0), "INVALID_INPUT"],
  ] as const)("checks %s", (_label, before, sent, ctx, reason) => {
    const output = applyKeystrokes(before, sent, ctx);
    expect(output.result).toMatchObject({ reason });
    expect(output.entrant).toBe(before);
  });

  it("refuses that same batch for plausibility once every input is valid", () => {
    const before = entrant("a".repeat(100));
    const output = applyKeystrokes(before, batch(1, Array.from({ length: 21 }, () => insert("a"))), context("free", 0));
    expect(output.result).toMatchObject({ outcome: "refused", reason: "IMPLAUSIBLE" });
    expect(output.entrant).toBe(before);
  });

  it("answers an older seq as a duplicate, with the current ackSeq", () => {
    const before = entrant("ab", { typed: ["a"], ackSeq: 3, counters: { correctInserts: 1, totalInserts: 1 } });
    const output = applyKeystrokes(before, batch(2, [insert("b")]), context("free", 1_000));
    expect(output.result).toEqual({ outcome: "duplicate", seq: 2, ackSeq: 3 });
    expect(output.entrant).toBe(before);
  });

  it("in mandatory correction, clears a pending error without removing a grapheme, then removes one", () => {
    const before = entrant("ab", { typed: ["a"], pendingError: true, ackSeq: 2, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { b: 1 } });
    const once = applyKeystrokes(before, batch(3, [deleteBackward]), context("mandatory", 1_000));
    expect(once.entrant).toMatchObject({ typed: ["a"], pendingError: false, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { b: 1 } });
    const twice = applyKeystrokes(before, batch(3, [deleteBackward, deleteBackward]), context("mandatory", 1_000));
    expect(twice.entrant).toMatchObject({ typed: [], pendingError: false, counters: { correctInserts: 1, totalInserts: 2 } });
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])("refuses seq %s as an invalid shape", (seq) => {
    expect(applyKeystrokes(entrant("ab"), batch(seq, [insert("a")]), context("free", 1_000)).result).toMatchObject({ outcome: "refused", reason: "INVALID_INPUT" });
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("refuses textVersion %s as an invalid shape", (textVersion) => {
    expect(applyKeystrokes(entrant("ab"), batch(1, [insert("a")], textVersion), context("free", 1_000)).result).toMatchObject({ outcome: "refused", reason: "INVALID_INPUT" });
  });

  it.each([
    ["an event of an unknown type", { type: "paste", text: "ab" }],
    ["an insert without a string", { type: "insert", grapheme: 42 }],
  ])("refuses %s", (_label, event) => {
    const sent = batch(1, [event as unknown as InputEvent]);
    expect(applyKeystrokes(entrant("ab"), sent, context("free", 1_000)).result).toMatchObject({ outcome: "refused", reason: "INVALID_INPUT" });
  });

  it("finishes at the server's instant of the batch", () => {
    const output = applyKeystrokes(entrant("ab"), batch(1, [insert("a"), insert("b")]), context("mandatory", 4_321));
    expect(output.entrant).toMatchObject({ status: "finished", endedAt: at(4_321) });
  });
});

describe("toEntrantSnapshot", () => {
  const race: RaceState = {
    raceId: asRaceId("race-9"),
    revision: 2,
    phase: "racing",
    errorMode: "free",
    timeLimit: null,
    countdownAt: at(-3_000),
    startsAt: at(0),
    clock: at(0),
    text: toGraphemes("ab"),
    entrants: [entrant("ab", { typed: ["a"], ackSeq: 2, counters: { correctInserts: 1, totalInserts: 1 } })],
  };

  it("projects the authoritative state of a known entrant", () => {
    expect(toEntrantSnapshot(race, EXAMPLE_ENTRANT)).toEqual({
      raceId: asRaceId("race-9"),
      entrantId: EXAMPLE_ENTRANT,
      textVersion: 0,
      target: ["a", "b"],
      typed: ["a"],
      pendingError: false,
      ackSeq: 2,
      status: "racing",
      counters: { correctInserts: 1, totalInserts: 1 },
    });
  });

  it("gives undefined for an entrant the race does not know", () => {
    expect(toEntrantSnapshot(race, asEntrantId("mallory"))).toBeUndefined();
  });
});

describe("applyKeystrokes invariants over seeded random batches", () => {
  const graphemes = ["a", "b", " ", "é", "é", "x", "ab"];
  const text = "ab é ba a b ab é ba a b ab é ba a b";
  for (const errorMode of ["free", "mandatory"] as const) {
    // 6 000 batches per mode: about 0.5 s alone, but several seconds on a loaded machine.
    it(`holds in ${errorMode} mode, and reaches every outcome`, { timeout: 30_000 }, () => {
      const random = seeded(errorMode === "free" ? 7 : 11);
      const reached = new Set<string>();
      for (let run = 0; run < 200; run += 1) {
        // A third of the runs type far too fast, so the plausibility limit is reached.
        const pace = random() < 0.3 ? 50 : 400;
        let state = entrant(text);
        let now = 0;
        for (let step = 0; step < 30; step += 1) {
          now += Math.floor(random() * pace);
          const roll = random();
          const seq = roll < 0.1 ? state.ackSeq : roll < 0.15 ? state.ackSeq + 2 : state.ackSeq + 1;
          const length = random() < 0.02 ? MAX_BATCH_EVENTS + 1 : 1 + Math.floor(random() * 8);
          const events: InputEvent[] = [];
          let cursor = state.typed.length;
          while (events.length < length) {
            const expected = state.target[cursor];
            if (random() < 0.2) {
              events.push(deleteBackward);
            } else if (errorMode === "mandatory" && expected !== undefined && random() < 0.6) {
              // Mandatory correction only moves on the expected grapheme: offer it often enough to finish.
              events.push(insert(expected));
              cursor += 1;
            } else {
              events.push(insert(graphemes[Math.floor(random() * graphemes.length)] ?? "a"));
            }
          }
          const phase = random() < 0.02 ? "ended" : "racing";
          const before = state;
          const { entrant: after, result } = applyKeystrokes(before, batch(seq, events, random() < 0.05 ? 1 : 0), context(errorMode, now, phase));
          reached.add(outcomeOf(result));
          if (result.outcome !== "applied") {
            expect(after).toBe(before);
            continue;
          }
          expect(result.ackSeq).toBe(before.ackSeq + 1);
          expect(after.counters.correctInserts).toBeLessThanOrEqual(after.counters.totalInserts);
          expect(after.counters.totalInserts).toBeGreaterThanOrEqual(before.counters.totalInserts);
          expect(after.counters.correctInserts).toBeGreaterThanOrEqual(before.counters.correctInserts);
          expect(Object.values(after.missedKeys).reduce((sum, count) => sum + count, 0)).toBe(after.counters.totalInserts - after.counters.correctInserts);
          expect(after.counters.totalInserts).toBeLessThanOrEqual(maxPlausibleInserts(measuredElapsed(STARTS_AT, at(now))));
          expect(after.typed.length).toBeLessThanOrEqual(after.target.length);
          expect(after.status === "finished").toBe(after.typed.length === after.target.length);
          if (after.status === "finished") {
            reached.add("finished");
            expect(after.endedAt).toBe(at(now));
          }
          if (errorMode === "mandatory") {
            expect(after.typed).toEqual(after.target.slice(0, after.typed.length));
          } else {
            expect(after.pendingError).toBe(false);
          }
          state = after;
        }
      }
      // Batches after the finish keep coming, so ENTRANT_TERMINAL is reached too.
      expect([...reached].sort()).toEqual(
        ["BATCH_TOO_LARGE", "ENTRANT_TERMINAL", "IMPLAUSIBLE", "INVALID_INPUT", "NOT_RACING", "OUT_OF_ORDER", "TEXT_VERSION_CHANGED", "applied", "duplicate", "finished"].sort(),
      );
    });
  }
});
