import type { ContractExample } from "../contract-example";
import { asEntrantId, asRaceId } from "../ids";
import { toGraphemes } from "../text/graphemes";
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
} from "./types";

/**
 * Accepted and refused batches, shared with the server (track A). Executed by F-04.4 against
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

function context(errorMode: ErrorMode, sinceStart: number): KeystrokeContext {
  return { errorMode, startsAt: STARTS_AT, now: at(sinceStart) };
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

type KeystrokeInput = { readonly entrant: EntrantState; readonly batch: KeystrokeBatch; readonly context: KeystrokeContext };
type KeystrokeExpectation = { readonly result: KeystrokeResult; readonly entrant: EntrantState };

const typedAb = entrant("ab", { typed: ["a"], ackSeq: 3, counters: { correctInserts: 1, totalInserts: 1 } });
const forty = entrant("a".repeat(100), { typed: toGraphemes("a".repeat(40)), ackSeq: 4, counters: { correctInserts: 40, totalInserts: 40 } });
const thirtyNine = entrant("a".repeat(100), { typed: toGraphemes("a".repeat(39)), ackSeq: 4, counters: { correctInserts: 39, totalInserts: 39 } });
const finished = entrant("ab", { typed: ["a", "b"], ackSeq: 2, status: "finished", endedAt: at(9_000), counters: { correctInserts: 2, totalInserts: 2 } });
const bonusChanged = entrant("ab cd", { textVersion: 1 });
const pending = entrant("ab", { pendingError: true, ackSeq: 1, counters: { correctInserts: 0, totalInserts: 1 }, missedKeys: { a: 1 } });

export const KEYSTROKE_EXAMPLES: readonly ContractExample<KeystrokeInput, KeystrokeExpectation>[] = [
  {
    name: "a first batch (seq 1) of correct inserts is applied and acknowledged",
    input: { entrant: entrant("ab"), batch: batch(1, inserts("a")), context: context("free", 1_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 1, textVersion: 0 },
      entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } }),
    },
  },
  {
    name: "free mode: a wrong insert enters the text and counts; a deletion lets the player correct it",
    input: { entrant: entrant("ab"), batch: batch(1, [insert("x"), deleteBackward, insert("a")]), context: context("free", 1_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 1, textVersion: 0 },
      entrant: entrant("ab", { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 } }),
    },
  },
  {
    name: "free mode: reaching the end finishes, even with an error left in the text",
    input: { entrant: entrant("ab"), batch: batch(1, inserts("xb")), context: context("free", 2_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 1, textVersion: 0 },
      entrant: entrant("ab", {
        typed: ["x", "b"], ackSeq: 1, status: "finished", endedAt: at(2_000),
        counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 },
      }),
    },
  },
  {
    name: "mandatory correction: a wrong insert counts, is never inserted, and marks the expected grapheme",
    input: { entrant: entrant("ab"), batch: batch(1, inserts("x")), context: context("mandatory", 1_000) },
    expected: { result: { outcome: "applied", ackSeq: 1, textVersion: 0 }, entrant: pending },
  },
  {
    name: "mandatory correction: typing the expected grapheme clears the error",
    input: { entrant: pending, batch: batch(2, inserts("a")), context: context("mandatory", 1_500) },
    expected: {
      result: { outcome: "applied", ackSeq: 2, textVersion: 0 },
      entrant: entrant("ab", { typed: ["a"], ackSeq: 2, counters: { correctInserts: 1, totalInserts: 2 }, missedKeys: { a: 1 } }),
    },
  },
  {
    name: "mandatory correction: a deletion clears a pending error and counts nothing",
    input: { entrant: pending, batch: batch(2, [deleteBackward]), context: context("mandatory", 1_500) },
    expected: {
      result: { outcome: "applied", ackSeq: 2, textVersion: 0 },
      entrant: entrant("ab", { ackSeq: 2, counters: { correctInserts: 0, totalInserts: 1 }, missedKeys: { a: 1 } }),
    },
  },
  {
    name: "a decomposed accent is one grapheme and matches the precomposed target",
    input: { entrant: entrant("é"), batch: batch(1, [insert("é")]), context: context("free", 1_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 1, textVersion: 0 },
      entrant: entrant("é", { typed: ["é"], ackSeq: 1, status: "finished", endedAt: at(1_000), counters: { correctInserts: 1, totalInserts: 1 } }),
    },
  },
  {
    name: "inserts after the finish, in the same batch, are discarded and not counted",
    input: { entrant: entrant("a"), batch: batch(1, inserts("ab")), context: context("free", 1_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 1, textVersion: 0 },
      entrant: entrant("a", { typed: ["a"], ackSeq: 1, status: "finished", endedAt: at(1_000), counters: { correctInserts: 1, totalInserts: 1 } }),
    },
  },
  {
    name: "a retried batch (seq <= ackSeq) changes nothing",
    input: { entrant: typedAb, batch: batch(3, inserts("b")), context: context("free", 3_000) },
    expected: { result: { outcome: "duplicate", ackSeq: 3 }, entrant: typedAb },
  },
  {
    name: "a gap in the sequence asks for a resync; the client continues at ackSeq + 1",
    input: { entrant: typedAb, batch: batch(5, inserts("b")), context: context("free", 3_000) },
    expected: { result: { outcome: "resync", reason: "OUT_OF_ORDER", snapshot: snapshot(typedAb) }, entrant: typedAb },
  },
  {
    name: "a batch typed against an older version of this player's text asks for a resync",
    input: { entrant: bonusChanged, batch: batch(1, inserts("a"), 0), context: context("free", 3_000) },
    expected: { result: { outcome: "resync", reason: "TEXT_VERSION_CHANGED", snapshot: snapshot(bonusChanged) }, entrant: bonusChanged },
  },
  {
    name: `more than ${MAX_BATCH_EVENTS} events are refused whole`,
    input: { entrant: entrant("a".repeat(100)), batch: batch(1, inserts("a".repeat(MAX_BATCH_EVENTS + 1))), context: context("free", 10_000) },
    expected: {
      result: { outcome: "refused", reason: "BATCH_TOO_LARGE", snapshot: snapshot(entrant("a".repeat(100))) },
      entrant: entrant("a".repeat(100)),
    },
  },
  {
    name: "an insert of two graphemes is refused whole",
    input: { entrant: entrant("ab"), batch: batch(1, [insert("a"), insert("ab")]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", reason: "INVALID_INPUT", snapshot: snapshot(entrant("ab")) }, entrant: entrant("ab") },
  },
  {
    name: "an empty insert is refused whole",
    input: { entrant: entrant("ab"), batch: batch(1, [insert("")]), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", reason: "INVALID_INPUT", snapshot: snapshot(entrant("ab")) }, entrant: entrant("ab") },
  },
  {
    name: "one second after the start, 46 inserts in total exceed the plausible 45: refused whole",
    input: { entrant: forty, batch: batch(5, inserts("aaaaaa")), context: context("free", 1_000) },
    expected: { result: { outcome: "refused", reason: "IMPLAUSIBLE", snapshot: snapshot(forty) }, entrant: forty },
  },
  {
    name: "one second after the start, exactly 45 inserts in total are accepted",
    input: { entrant: thirtyNine, batch: batch(5, inserts("aaaaaa")), context: context("free", 1_000) },
    expected: {
      result: { outcome: "applied", ackSeq: 5, textVersion: 0 },
      entrant: entrant("a".repeat(100), { typed: toGraphemes("a".repeat(45)), ackSeq: 5, counters: { correctInserts: 45, totalInserts: 45 } }),
    },
  },
  {
    name: "an entrant who already finished is refused, with a snapshot",
    input: { entrant: finished, batch: batch(3, inserts("a")), context: context("free", 10_000) },
    expected: { result: { outcome: "refused", reason: "ENTRANT_TERMINAL", snapshot: snapshot(finished) }, entrant: finished },
  },
];
