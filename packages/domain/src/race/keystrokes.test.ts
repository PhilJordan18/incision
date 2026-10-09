import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asInstant, type Instant } from "../time";
import { measuredElapsed } from "./elapsed";
import { applyKeystrokes, toEntrantSnapshot } from "./keystrokes";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE, KEYSTROKE_EXAMPLES } from "./keystrokes.examples";
import { maxPlausibleInserts } from "./limits";
import type { EntrantState, ErrorMode, InputEvent, KeystrokeBatch, KeystrokeContext, RaceState } from "./types";

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
const context = (errorMode: ErrorMode, sinceStart: number): KeystrokeContext => ({ errorMode, phase: "racing", startsAt: STARTS_AT, now: at(sinceStart) });

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

describe("applyKeystrokes (F-04.4)", () => {
  it.each(KEYSTROKE_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    const { entrant: before, batch: sent, context: ctx } = example.input;
    const output = applyKeystrokes(frozen(copy(before)), frozen(copy(sent)), ctx);
    expect(output.result).toEqual(example.expected.result);
    expect(output.entrant).toEqual(example.expected.entrant);
  });

  it("returns the very same entrant object for every reply other than applied", () => {
    const before = entrant("ab", { typed: ["a"], ackSeq: 3, counters: { correctInserts: 1, totalInserts: 1 } });
    for (const [sent, ctx] of [
      [batch(3, [insert("b")]), context("free", 1_000)],
      [batch(5, [insert("b")]), context("free", 1_000)],
      [batch(4, [insert("b")], 1), context("free", 1_000)],
      [batch(4, [insert("ab")]), context("free", 1_000)],
      [batch(4, [insert("b")]), { ...context("free", 1_000), phase: "ended" as const }],
    ] as const) {
      expect(applyKeystrokes(before, sent, ctx).entrant).toBe(before);
    }
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])("refuses seq %s as an invalid shape", (seq) => {
    expect(applyKeystrokes(entrant("ab"), batch(seq, [insert("a")]), context("free", 1_000)).result).toMatchObject({ outcome: "refused", reason: "INVALID_INPUT" });
  });

  it.each([-1, 0.5])("refuses textVersion %s as an invalid shape", (textVersion) => {
    expect(applyKeystrokes(entrant("ab"), batch(1, [insert("a")], textVersion), context("free", 1_000)).result).toMatchObject({ outcome: "refused", reason: "INVALID_INPUT" });
  });

  it("refuses an event of an unknown type", () => {
    const sent = batch(1, [{ type: "paste", text: "ab" } as unknown as InputEvent]);
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
  const graphemes = ["a", "b", " ", "é", "é", "x", "ab"];
  for (const errorMode of ["free", "mandatory"] as const) {
    it(`holds in ${errorMode} mode`, () => {
      const random = seeded(errorMode === "free" ? 7 : 11);
      for (let run = 0; run < 200; run += 1) {
        let state = entrant("ab é ba a b");
        let now = 0;
        for (let step = 0; step < 30; step += 1) {
          now += Math.floor(random() * 400);
          const roll = random();
          const seq = roll < 0.1 ? state.ackSeq : roll < 0.15 ? state.ackSeq + 2 : state.ackSeq + 1;
          const events: InputEvent[] = Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
            random() < 0.2 ? { type: "deleteBackward" } : insert(graphemes[Math.floor(random() * graphemes.length)] ?? "a"),
          );
          const before = state;
          const { entrant: after, result } = applyKeystrokes(before, batch(seq, events, random() < 0.05 ? 1 : 0), context(errorMode, now));
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
          if (errorMode === "mandatory") {
            expect(after.typed).toEqual(after.target.slice(0, after.typed.length));
          } else {
            expect(after.pendingError).toBe(false);
          }
          state = after;
          if (state.status !== "racing") {
            break;
          }
        }
      }
    });
  }
});
