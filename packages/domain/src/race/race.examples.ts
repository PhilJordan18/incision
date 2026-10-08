import type { ContractExample } from "../contract-example";
import { asEntrantId, asRaceId, type EntrantId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, type Instant } from "../time";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import type { EntrantState, EntrantStatus, KeystrokeResult, RaceEvent, RaceOutput, RacePhase, RaceState } from "./types";

/**
 * Race-level behaviour of the first path, shared with the server (track A). Executed by F-04.1
 * against `reduceRace`. The countdown begins at 997 000 ms and the race starts at 1 000 000 ms;
 * `at(n)` is n ms after the start.
 */
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
    text: toGraphemes("ab"),
    entrants: [runner(EXAMPLE_ENTRANT), runner(BOB)],
    ...overrides,
  };
}

function keystrokes(raceId: string, entrantId: EntrantId, seq: number, text: string, sinceStart: number): RaceEvent {
  return {
    type: "keystrokes",
    batch: { raceId: asRaceId(raceId), entrantId, seq, textVersion: 0, events: toGraphemes(text).map((grapheme) => ({ type: "insert", grapheme })) },
    now: at(sinceStart),
  };
}

/** What each example checks of the `RaceOutput`; omitted fields are not part of the example. */
type RaceExpectation = {
  readonly phase: RacePhase;
  readonly changed: boolean;
  readonly keystrokes?: Pick<KeystrokeResult, "outcome"> & { readonly reason?: string };
  readonly ignored?: RaceOutput["ignored"];
  readonly statuses?: Readonly<Partial<Record<string, EntrantStatus>>>;
  /** Entrant ids from rank 1, when the event ends the race; absent means `ended` is absent. */
  readonly ranking?: readonly EntrantId[];
};

const aliceDone = runner(EXAMPLE_ENTRANT, { typed: ["a", "b"], ackSeq: 1, status: "finished", endedAt: at(2_000), counters: { correctInserts: 2, totalInserts: 2 } });
const bobHalfway = runner(BOB, { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } });

export const RACE_EXAMPLES: readonly ContractExample<{ readonly state: RaceState; readonly event: RaceEvent }, RaceExpectation>[] = [
  {
    name: "a keystroke before the common start is refused, with a snapshot",
    input: { state: race({ phase: "countdown" }), event: keystrokes("race-1", BOB, 1, "a", -1) },
    expected: { phase: "countdown", changed: false, keystrokes: { outcome: "refused", reason: "NOT_RACING" } },
  },
  {
    name: "one millisecond before the start, a tick changes nothing",
    input: { state: race({ phase: "countdown" }), event: { type: "tick", now: at(-1) } },
    expected: { phase: "countdown", changed: false },
  },
  {
    name: "the race starts exactly at startsAt",
    input: { state: race({ phase: "countdown" }), event: { type: "tick", now: at(0) } },
    expected: { phase: "racing", changed: true },
  },
  {
    name: "a batch from another race is refused",
    input: { state: race(), event: keystrokes("race-0", BOB, 1, "a", 1_000) },
    expected: { phase: "racing", changed: false, keystrokes: { outcome: "refused", reason: "WRONG_RACE" } },
  },
  {
    name: "an entrant the race does not know is refused",
    input: { state: race(), event: keystrokes("race-1", asEntrantId("mallory"), 1, "a", 1_000) },
    expected: { phase: "racing", changed: false, keystrokes: { outcome: "refused", reason: "UNKNOWN_ENTRANT" } },
  },
  {
    name: "another player's progress (a later revision) never invalidates a batch",
    input: { state: race({ revision: 57 }), event: keystrokes("race-1", BOB, 1, "a", 1_000) },
    expected: { phase: "racing", changed: true, keystrokes: { outcome: "applied" } },
  },
  {
    name: "the last entrant finishing ends the race once, ranked by arrival",
    input: { state: race({ entrants: [aliceDone, bobHalfway] }), event: keystrokes("race-1", BOB, 2, "b", 3_000) },
    expected: { phase: "ended", changed: true, keystrokes: { outcome: "applied" }, statuses: { bob: "finished" }, ranking: [EXAMPLE_ENTRANT, BOB] },
  },
  {
    name: "after the end, a tick changes nothing and produces no second result",
    input: { state: race({ phase: "ended", endedAt: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000) })] }), event: { type: "tick", now: at(4_000) } },
    expected: { phase: "ended", changed: false },
  },
  {
    name: "an abandon during the countdown is allowed",
    input: { state: race({ phase: "countdown" }), event: { type: "abandon", entrantId: BOB, now: at(-2_000) } },
    expected: { phase: "countdown", changed: true, statuses: { bob: "abandoned" } },
  },
  {
    name: "an abandon by an entrant who already finished changes nothing",
    input: { state: race({ entrants: [aliceDone, runner(BOB)] }), event: { type: "abandon", entrantId: EXAMPLE_ENTRANT, now: at(5_000) } },
    expected: { phase: "racing", changed: false, ignored: "ENTRANT_TERMINAL" },
  },
  {
    name: "the last runner abandoning ends the race: the finisher first, the abandon last",
    input: { state: race({ entrants: [aliceDone, bobHalfway] }), event: { type: "abandon", entrantId: BOB, now: at(5_000) } },
    expected: { phase: "ended", changed: true, statuses: { bob: "abandoned" }, ranking: [EXAMPLE_ENTRANT, BOB] },
  },
  {
    name: "an interruption produces no results (D-06)",
    input: { state: race(), event: { type: "interrupt", now: at(5_000) } },
    expected: { phase: "interrupted", changed: true },
  },
  {
    name: "with no time limit, even an hour later a tick never ends the race (D-17)",
    input: { state: race(), event: { type: "tick", now: at(3_600_000) } },
    expected: { phase: "racing", changed: false },
  },
  {
    name: "the time limit ends the race and times out whoever is still racing",
    input: { state: race({ timeLimit: asDuration(30_000), entrants: [aliceDone, bobHalfway] }), event: { type: "tick", now: at(30_000) } },
    expected: { phase: "ended", changed: true, statuses: { bob: "timedOut" }, ranking: [EXAMPLE_ENTRANT, BOB] },
  },
];

