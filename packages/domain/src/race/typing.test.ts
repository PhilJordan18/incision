import { describe, expect, it } from "vitest";
import { toGraphemes } from "../text/graphemes";
import { asInstant, type Instant } from "../time";
import { applyKeystrokes } from "./keystrokes";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE, KEYSTROKE_EXAMPLES } from "./keystrokes.examples";
import { MAX_BATCH_EVENTS } from "./limits";
import type { EntrantState, ErrorMode, InputEvent, KeystrokeBatch, KeystrokeContext, TypingStart } from "./types";
import { predictTyping, typedMarks } from "./typing";

const STARTS_AT = asInstant(1_000_000);
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);
const insert = (grapheme: string): InputEvent => ({ type: "insert", grapheme });
const deleteBackward: InputEvent = { type: "deleteBackward" };
const start = (target: string, typed: readonly string[] = [], pendingError = false): TypingStart => ({ target: toGraphemes(target), typed, pendingError });

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

function batch(seq: number, events: readonly InputEvent[]): KeystrokeBatch {
  return { raceId: EXAMPLE_RACE, entrantId: EXAMPLE_ENTRANT, seq, textVersion: 0, events };
}

const context = (errorMode: ErrorMode, sinceStart: number): KeystrokeContext => ({ errorMode, phase: "racing", startsAt: STARTS_AT, now: at(sinceStart) });

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

describe("predictTyping (COURSE-04)", () => {
  it("equals the entrant of every applied contract example", () => {
    let applied = 0;
    for (const example of KEYSTROKE_EXAMPLES) {
      if (example.expected.result.outcome !== "applied") {
        continue;
      }
      applied += 1;
      const { entrant: before, batch: sent, context: ctx } = example.input;
      const prediction = predictTyping(before, sent.events, ctx.errorMode);
      const after = example.expected.entrant;
      expect(prediction).toEqual({ ok: true, typed: after.typed, marks: typedMarks(after.target, after.typed), pendingError: after.pendingError, finished: after.status === "finished" });
    }
    expect(applied).toBeGreaterThan(10);
  });

  it("marks a wrong grapheme in free mode until it is deleted, and the retyped one as correct", () => {
    expect(predictTyping(start("abc"), [insert("a"), insert("x")], "free")).toEqual({ ok: true, typed: ["a", "x"], marks: ["correct", "wrong"], pendingError: false, finished: false });
    expect(predictTyping(start("abc"), [insert("a"), insert("x"), deleteBackward, insert("b")], "free")).toEqual({ ok: true, typed: ["a", "b"], marks: ["correct", "correct"], pendingError: false, finished: false });
  });

  it("in mandatory correction, never advances on a wrong grapheme and shows the expected one in error", () => {
    expect(predictTyping(start("abc"), [insert("a"), insert("x"), insert("y")], "mandatory")).toEqual({ ok: true, typed: ["a"], marks: ["correct"], pendingError: true, finished: false });
    expect(predictTyping(start("abc", ["a"], true), [deleteBackward], "mandatory")).toMatchObject({ typed: ["a"], pendingError: false });
    expect(predictTyping(start("abc", ["a"], true), [insert("b")], "mandatory")).toMatchObject({ typed: ["a", "b"], pendingError: false });
  });

  it("compares NFC graphemes: a decomposed accent typed against a precomposed one is correct", () => {
    expect(predictTyping(start("été"), [insert("é")], "free")).toMatchObject({ ok: true, typed: ["é"], marks: ["correct"] });
  });

  it("finishes on the last grapheme and discards the events after it", () => {
    expect(predictTyping(start("ab"), [insert("a"), insert("b"), insert("c"), deleteBackward], "free")).toEqual({ ok: true, typed: ["a", "b"], marks: ["correct", "correct"], pendingError: false, finished: true });
    expect(predictTyping(start("ab", ["a", "b"]), [deleteBackward], "free")).toMatchObject({ typed: ["a", "b"], finished: true });
  });

  it("accepts more pending events than one batch carries: the server's checks are not predicted", () => {
    const prediction = predictTyping(start("a".repeat(100)), Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => insert("a")), "free");
    expect(prediction).toMatchObject({ ok: true, finished: false });
    expect(prediction.ok && prediction.typed).toHaveLength(MAX_BATCH_EVENTS + 1);
  });

  it.each([
    ["two graphemes", insert("ab")],
    ["an empty insert", insert("")],
    ["a grapheme over the length bound", insert(`a${"́".repeat(16)}`)],
    ["Enter (D-16)", insert("\n")],
    ["a CRLF (D-16)", insert("\r\n")],
    ["a non-string grapheme", { type: "insert", grapheme: 42 } as unknown as InputEvent],
    ["an unknown event type", { type: "paste", text: "ab" } as unknown as InputEvent],
  ])("predicts nothing for %s, which the server would refuse with the whole batch", (_label, invalid) => {
    expect(predictTyping(start("abc"), [insert("a"), invalid, insert("b")], "free")).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });

  it("leaves its inputs untouched", () => {
    const typed = frozen(["a"]);
    const events = frozen([insert("b"), deleteBackward, insert("x")]);
    expect(() => predictTyping(frozen(start("abc", typed)), events, "free")).not.toThrow();
    expect(typed).toEqual(["a"]);
  });
});

describe("typedMarks", () => {
  it("compares every typed grapheme with the target at its position", () => {
    expect(typedMarks(toGraphemes("abc"), ["a", "x", "c"])).toEqual(["correct", "wrong", "correct"]);
    expect(typedMarks(toGraphemes("abc"), [])).toEqual([]);
  });
});

describe("predictTyping equals what applyKeystrokes applies, over seeded random batches", () => {
  const graphemes = ["a", "b", " ", "é", "é", "x", "\u{1F469}‍\u{1F4BB}", "ab", "\n"];
  const text = "ab é \u{1F469}‍\u{1F4BB} ba a b ab é ba";
  for (const errorMode of ["free", "mandatory"] as const) {
    it(`in ${errorMode} mode`, { timeout: 30_000 }, () => {
      const random = seeded(errorMode === "free" ? 101 : 202);
      const reached = new Set<string>();
      for (let run = 0; run < 200; run += 1) {
        let state = entrant(text);
        let now = 0;
        for (let step = 0; step < 30 && state.status === "racing"; step += 1) {
          now += Math.floor(random() * 600);
          const events: InputEvent[] = Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
            if (random() < 0.2) {
              return deleteBackward;
            }
            const expected = state.target[state.typed.length];
            return insert(errorMode === "mandatory" && expected !== undefined && random() < 0.5 ? expected : (graphemes[Math.floor(random() * graphemes.length)] ?? "a"));
          });
          const { entrant: after, result } = applyKeystrokes(state, batch(state.ackSeq + 1, events), context(errorMode, now));
          const prediction = predictTyping({ target: state.target, typed: state.typed, pendingError: state.pendingError }, events, errorMode);
          reached.add(result.outcome === "refused" ? result.reason : result.outcome);
          if (result.outcome === "applied") {
            expect(prediction).toEqual({ ok: true, typed: after.typed, marks: typedMarks(after.target, after.typed), pendingError: after.pendingError, finished: after.status === "finished" });
            if (after.status === "finished") {
              reached.add("finished");
            }
          } else if (result.outcome === "refused" && result.reason === "INVALID_INPUT") {
            expect(prediction).toEqual({ ok: false, reason: "INVALID_INPUT" });
          }
          state = after;
        }
      }
      // IMPLAUSIBLE is the server's only refusal of a valid batch here: the prediction stays visual.
      for (const outcome of ["applied", "INVALID_INPUT", "finished"]) {
        expect([...reached]).toContain(outcome);
      }
    });
  }
});
