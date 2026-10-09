import type { ContractExample } from "../contract-example";
import { asEntrantId, asRaceId } from "../ids";
import { MAX_GRAPHEME_LENGTH, toGraphemes } from "../text/graphemes";
import { asInstant, type Instant } from "../time";
import { MAX_BATCH_EVENTS } from "./limits";
import type {
  EntrantSnapshot,
  EntrantState,
  ErrorMode,
  InputEvent,
  KeystrokeBatch,
  KeystrokeContext,
  KeystrokeResult,
  RacePhase,
} from "./types";

/**
 * Accepted and refused batches, shared with the server. Executed by F-04.4 against
 * `applyKeystrokes`. The race starts at 1 000 000 ms; `at(n)` is n ms after the start.
 */
export const EXAMPLE_RACE = asRaceId("race-1");
export const EXAMPLE_ENTRANT = asEntrantId("alice");
const STARTS_AT = asInstant(1_000_000);
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);

const insert = (grapheme: string): InputEvent => ({ type: "insert", grapheme });
const inserts = (text: string): InputEvent[] => toGraphemes(text).map(insert);
const deleteBackward: InputEvent = { type: "deleteBackward" };

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

function context(errorMode: ErrorMode, sinceStart: number, phase: RacePhase = "racing"): KeystrokeContext {
  return { errorMode, phase, startsAt: STARTS_AT, now: at(sinceStart) };
}

function snapshot(state: EntrantState): EntrantSnapshot {
  return {
    raceId: EXAMPLE_RACE,
    entrantId: state.entrantId,
    textVersion: state.textVersion,
    target: state.target,
    typed: state.typed,
    pendingError: state.pendingError,
    ackSeq: state.ackSeq,
    status: state.status,
    counters: state.counters,
  };
}

const applied = (seq: number, textVersion = 0): KeystrokeResult => ({ outcome: "applied", seq, ackSeq: seq, textVersion });

type KeystrokeInput = { readonly entrant: EntrantState; readonly batch: KeystrokeBatch; readonly context: KeystrokeContext };
type KeystrokeExpectation = { readonly result: KeystrokeResult; readonly entrant: EntrantState };

const ab = entrant("ab");
const long = entrant("a".repeat(100));
const typedAb = entrant("ab", { typed: ["a"], ackSeq: 3, counters: { correctInserts: 1, totalInserts: 1 } });
const forty = entrant("a".repeat(100), { typed: toGraphemes("a".repeat(40)), ackSeq: 4, counters: { correctInserts: 40, totalInserts: 40 } });
const thirtyNine = entrant("a".repeat(100), { typed: toGraphemes("a".repeat(39)), ackSeq: 4, counters: { correctInserts: 39, totalInserts: 39 } });
const finished = entrant("ab", { typed: ["a", "b"], ackSeq: 2, status: "finished", endedAt: at(9_000), counters: { correctInserts: 2, totalInserts: 2 } });
const bonusChanged = entrant("ab cd", { textVersion: 1 });
const pending = entrant("ab", { pendingError: true, ackSeq: 1, counters: { correctInserts: 0, totalInserts: 1 }, missedKeys: { a: 1 } });

export const KEYSTROKE_EXAMPLES: readonly ContractExample<KeystrokeInput, KeystrokeExpectation>[] = [
  {
    name: "a first batch (seq 1) of correct inserts is applied and acknowledged",
    input: { entrant: ab, batch: batch(1, inserts("a")), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } }) },
  },
  {
    name: "a keystroke exactly at the start is applied (the reducer has moved the phase to racing)",
    input: { entrant: ab, batch: batch(1, inserts("a")), context: context("free", 0) },
    expected: { result: applied(1), entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } }) },
  },
  {
    name: "a keystroke while the race is not racing is refused, with a snapshot",
    input: { entrant: ab, batch: batch(1, inserts("a")), context: context("free", -1, "countdown") },
    expected: { result: { outcome: "refused", seq: 1, reason: "NOT_RACING", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: "free mode: a wrong insert enters the text and counts; a deletion lets the player correct it",
    input: { entrant: ab, batch: batch(1, [insert("x"), deleteBackward, insert("a")]), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 } }) },
  },
  {
    name: "free mode: a correct grapheme deleted and retyped counts as two correct inserts (D-09)",
    input: { entrant: ab, batch: batch(1, [insert("a"), deleteBackward, insert("a")]), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 2, totalInserts: 2 } }) },
  },
  {
    name: "a deletion at position 0 does nothing and counts nothing",
    input: { entrant: ab, batch: batch(1, [deleteBackward]), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("ab", { ackSeq: 1 }) },
  },
  {
    name: "spaces count like any grapheme, and a wrong insert where a space is expected is missed on the space",
    input: { entrant: entrant("a b"), batch: batch(1, inserts("ax")), context: context("free", 1_000) },
    expected: {
      result: applied(1),
      entrant: entrant("a b", { typed: ["a", "x"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { " ": 1 } }),
    },
  },
  {
    name: "free mode: reaching the end finishes, even with an error left in the text",
    input: { entrant: ab, batch: batch(1, inserts("xb")), context: context("free", 2_000) },
    expected: {
      result: applied(1),
      entrant: entrant("ab", { typed: ["x", "b"], ackSeq: 1, status: "finished", endedAt: at(2_000), counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 } }),
    },
  },
  {
    name: "mandatory correction: a wrong insert counts, is never inserted, and marks the expected grapheme",
    input: { entrant: ab, batch: batch(1, inserts("x")), context: context("mandatory", 1_000) },
    expected: { result: applied(1), entrant: pending },
  },
  {
    name: "mandatory correction: random key-mashing never advances; every wrong insert counts",
    input: { entrant: entrant("abc"), batch: batch(1, inserts("xqzjw")), context: context("mandatory", 2_000) },
    expected: { result: applied(1), entrant: entrant("abc", { pendingError: true, ackSeq: 1, counters: { correctInserts: 0, totalInserts: 5 }, missedKeys: { a: 5 } }) },
  },
  {
    name: "mandatory correction: a second wrong insert while an error is pending counts again",
    input: { entrant: pending, batch: batch(2, inserts("y")), context: context("mandatory", 1_500) },
    expected: { result: applied(2), entrant: entrant("ab", { pendingError: true, ackSeq: 2, counters: { correctInserts: 0, totalInserts: 2 }, missedKeys: { a: 2 } }) },
  },
  {
    name: "mandatory correction: typing the expected grapheme clears the error",
    input: { entrant: pending, batch: batch(2, inserts("a")), context: context("mandatory", 1_500) },
    expected: { result: applied(2), entrant: entrant("ab", { typed: ["a"], ackSeq: 2, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 } }) },
  },
  {
    name: "mandatory correction: a deletion clears a pending error and counts nothing",
    input: { entrant: pending, batch: batch(2, [deleteBackward]), context: context("mandatory", 1_500) },
    expected: { result: applied(2), entrant: entrant("ab", { ackSeq: 2, counters: { correctInserts: 0, totalInserts: 1 }, missedKeys: { a: 1 } }) },
  },
  {
    name: "mandatory correction: without a pending error, a deletion moves back one grapheme",
    input: { entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } }), batch: batch(2, [deleteBackward]), context: context("mandatory", 1_500) },
    expected: { result: applied(2), entrant: entrant("ab", { ackSeq: 2, counters: { correctInserts: 1, totalInserts: 1 } }) },
  },
  {
    name: "a decomposed accent is one grapheme and matches the precomposed target",
    input: { entrant: entrant("é"), batch: batch(1, [insert("é")]), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("é", { typed: ["é"], ackSeq: 1, status: "finished", endedAt: at(1_000), counters: { correctInserts: 1, totalInserts: 1 } }) },
  },
  {
    name: "every event after the finishing insert, in the same batch, is discarded and not counted",
    input: { entrant: entrant("a"), batch: batch(1, [insert("a"), deleteBackward, insert("b")]), context: context("free", 1_000) },
    expected: { result: applied(1), entrant: entrant("a", { typed: ["a"], ackSeq: 1, status: "finished", endedAt: at(1_000), counters: { correctInserts: 1, totalInserts: 1 } }) },
  },
  {
    name: "a retried batch (seq <= ackSeq) changes nothing",
    input: { entrant: typedAb, batch: batch(3, inserts("b")), context: context("free", 3_000) },
    expected: { result: { outcome: "duplicate", seq: 3, ackSeq: 3 }, entrant: typedAb },
  },
  {
    name: "a retry of the finishing batch gets duplicate, not a refusal, even once the entrant finished",
    input: { entrant: finished, batch: batch(2, inserts("b")), context: context("free", 10_000, "ended") },
    expected: { result: { outcome: "duplicate", seq: 2, ackSeq: 2 }, entrant: finished },
  },
  {
    name: "after a reconnection, the in-flight batch the server never received is resent unchanged and applied",
    input: { entrant: typedAb, batch: batch(4, inserts("b")), context: context("free", 3_000) },
    expected: {
      result: applied(4),
      entrant: entrant("ab", { typed: ["a", "b"], ackSeq: 4, status: "finished", endedAt: at(3_000), counters: { correctInserts: 2, totalInserts: 2 } }),
    },
  },
  {
    name: "a gap in the sequence asks for a resync; the client continues at ackSeq + 1",
    input: { entrant: typedAb, batch: batch(5, inserts("b")), context: context("free", 3_000) },
    expected: { result: { outcome: "resync", seq: 5, reason: "OUT_OF_ORDER", snapshot: snapshot(typedAb) }, entrant: typedAb },
  },
  {
    name: "a batch typed against an older version of this player's text asks for a resync",
    input: { entrant: bonusChanged, batch: batch(1, inserts("a"), 0), context: context("free", 3_000) },
    expected: { result: { outcome: "resync", seq: 1, reason: "TEXT_VERSION_CHANGED", snapshot: snapshot(bonusChanged) }, entrant: bonusChanged },
  },
  {
    name: "a batch claiming a newer text version also asks for a resync",
    input: { entrant: ab, batch: batch(1, inserts("a"), 2), context: context("free", 3_000) },
    expected: { result: { outcome: "resync", seq: 1, reason: "TEXT_VERSION_CHANGED", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: `exactly ${MAX_BATCH_EVENTS} events are accepted`,
    input: { entrant: long, batch: batch(1, inserts("a".repeat(MAX_BATCH_EVENTS))), context: context("free", 10_000) },
    expected: {
      result: applied(1),
      entrant: entrant("a".repeat(100), { typed: toGraphemes("a".repeat(MAX_BATCH_EVENTS)), ackSeq: 1, counters: { correctInserts: MAX_BATCH_EVENTS, totalInserts: MAX_BATCH_EVENTS } }),
    },
  },
  {
    name: `more than ${MAX_BATCH_EVENTS} events are refused whole`,
    input: { entrant: long, batch: batch(1, inserts("a".repeat(MAX_BATCH_EVENTS + 1))), context: context("free", 10_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "BATCH_TOO_LARGE", snapshot: snapshot(long) }, entrant: long },
  },
  {
    name: "an empty batch is refused: it carries nothing to apply",
    input: { entrant: ab, batch: batch(1, []), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "INVALID_INPUT", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: "a fractional seq is refused",
    input: { entrant: ab, batch: batch(0.5, inserts("a")), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 0.5, reason: "INVALID_INPUT", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: "an insert of two graphemes is refused whole",
    input: { entrant: ab, batch: batch(1, [insert("a"), insert("ab")]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "INVALID_INPUT", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: "an empty insert is refused whole",
    input: { entrant: ab, batch: batch(1, [insert("")]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "INVALID_INPUT", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: `one grapheme longer than ${MAX_GRAPHEME_LENGTH} code units is refused whole`,
    input: { entrant: ab, batch: batch(1, [insert(`a${"́".repeat(MAX_GRAPHEME_LENGTH)}`)]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "INVALID_INPUT", snapshot: snapshot(ab) }, entrant: ab },
  },
  {
    name: "an invalid insert after the finishing insert still refuses the whole batch",
    input: { entrant: entrant("a"), batch: batch(1, [insert("a"), insert("ab")]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 1, reason: "INVALID_INPUT", snapshot: snapshot(entrant("a")) }, entrant: entrant("a") },
  },
  {
    name: "one second after the start, 46 inserts in total exceed the plausible 45: refused whole",
    input: { entrant: forty, batch: batch(5, inserts("aaaaaa")), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", seq: 5, reason: "IMPLAUSIBLE", snapshot: snapshot(forty) }, entrant: forty },
  },
  {
    name: "one second after the start, exactly 45 inserts in total are accepted",
    input: { entrant: thirtyNine, batch: batch(5, inserts("aaaaaa")), context: context("free", 1_000) },
    expected: {
      result: applied(5),
      entrant: entrant("a".repeat(100), { typed: toGraphemes("a".repeat(45)), ackSeq: 5, counters: { correctInserts: 45, totalInserts: 45 } }),
    },
  },
  {
    name: "inserts discarded after the finish never count toward the plausibility total",
    input: { entrant: entrant("a".repeat(45), { typed: toGraphemes("a".repeat(44)), ackSeq: 4, counters: { correctInserts: 44, totalInserts: 44 } }), batch: batch(5, inserts("aaa")), context: context("free", 1_000) },
    expected: {
      result: applied(5),
      entrant: entrant("a".repeat(45), { typed: toGraphemes("a".repeat(45)), ackSeq: 5, status: "finished", endedAt: at(1_000), counters: { correctInserts: 45, totalInserts: 45 } }),
    },
  },
  {
    name: "an entrant who already finished is refused, with a snapshot",
    input: { entrant: finished, batch: batch(3, inserts("a")), context: context("free", 10_000) },
    expected: { result: { outcome: "refused", seq: 3, reason: "ENTRANT_TERMINAL", snapshot: snapshot(finished) }, entrant: finished },
  },
];
