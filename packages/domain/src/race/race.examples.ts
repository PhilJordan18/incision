import type { ContractExample } from "../contract-example";
import { asEntrantId, asRaceId, type EntrantId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, type Duration, type Instant } from "../time";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import type {
  AbandonIgnored,
  EntrantKeystrokeRefusal,
  EntrantState,
  EntrantStatus,
  KeystrokeResult,
  RaceEvent,
  RaceKeystrokeRefusal,
  RacePhase,
  RaceState,
  ResyncReason,
} from "./types";

/**
 * Race-level behaviour of the first path, shared with the server. Executed by F-04.1 against
 * `reduceRace`. The countdown begins at 997 000 ms and the race starts at 1 000 000 ms; `at(n)`
 * is n ms after the start.
 */
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
  readonly keystrokes?: {
    readonly outcome: KeystrokeResult["outcome"];
    readonly reason?: RaceKeystrokeRefusal | EntrantKeystrokeRefusal | ResyncReason;
  };
  readonly ignored?: AbandonIgnored;
  readonly statuses?: readonly (readonly [EntrantId, EntrantStatus])[];
  /** Entrant ids from rank 1, when the event ends the race; absent means `ended` is absent. */
  readonly ranking?: readonly EntrantId[];
  readonly endedAt?: Instant;
  /** `EntrantResult.elapsed` per entrant, when the race ends. */
  readonly elapsed?: readonly (readonly [EntrantId, Duration])[];
  readonly nextDeadline?: Instant;
};

const aliceDone = runner(ALICE, { typed: ["a", "b"], ackSeq: 1, status: "finished", endedAt: at(2_000), counters: { correctInserts: 2, totalInserts: 2 } });
const bobHalfway = runner(BOB, { typed: ["a"], ackSeq: 1, counters: { correctInserts: 1, totalInserts: 1 } });
const countdown = race({ phase: "countdown", clock: at(-3_000) });
const thirtySeconds = asDuration(30_000);

export const RACE_EXAMPLES: readonly ContractExample<{ readonly state: RaceState; readonly event: RaceEvent }, RaceExpectation>[] = [
  {
    name: "a keystroke before the common start is refused, with a snapshot, and the start stays due",
    input: { state: countdown, event: keystrokes("race-1", BOB, 1, "a", -1) },
    expected: { phase: "countdown", changed: false, keystrokes: { outcome: "refused", reason: "NOT_RACING" }, nextDeadline: at(0) },
  },
  {
    name: "a keystroke at startsAt is applied even before the start tick: the start applies first",
    input: { state: countdown, event: keystrokes("race-1", BOB, 1, "a", 0) },
    expected: { phase: "racing", changed: true, keystrokes: { outcome: "applied" } },
  },
  {
    name: "one millisecond before the start, a tick changes nothing",
    input: { state: countdown, event: { type: "tick", now: at(-1) } },
    expected: { phase: "countdown", changed: false, nextDeadline: at(0) },
  },
  {
    name: "the race starts exactly at startsAt",
    input: { state: countdown, event: { type: "tick", now: at(0) } },
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
    expected: {
      phase: "ended", changed: true, keystrokes: { outcome: "applied" }, statuses: [[BOB, "finished"]], ranking: [ALICE, BOB], endedAt: at(3_000),
      elapsed: [[ALICE, asDuration(2_000)], [BOB, asDuration(3_000)]],
    },
  },
  {
    name: "after the end, a tick changes nothing and produces no second result",
    input: { state: race({ phase: "ended", endedAt: at(3_000), clock: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000) })] }), event: { type: "tick", now: at(4_000) } },
    expected: { phase: "ended", changed: false },
  },
  {
    name: "an abandon during the countdown is allowed; the race still waits for its start",
    input: { state: countdown, event: { type: "abandon", entrantId: BOB, now: at(-2_000) } },
    expected: { phase: "countdown", changed: true, statuses: [[BOB, "abandoned"]], nextDeadline: at(0) },
  },
  {
    name: "when everyone abandoned during the countdown, the race ends at startsAt: all abandons, zero elapsed, ranked by id",
    input: {
      state: race({ phase: "countdown", clock: at(-2_000), entrants: [runner(ALICE, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_000) }), runner(BOB, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_500) })] }),
      event: { type: "tick", now: at(0) },
    },
    expected: { phase: "ended", changed: true, ranking: [ALICE, BOB], endedAt: at(0), elapsed: [[ALICE, asDuration(0)], [BOB, asDuration(0)]] },
  },
  {
    name: "an abandon by an entrant who already finished changes nothing",
    input: { state: race({ entrants: [aliceDone, runner(BOB)] }), event: { type: "abandon", entrantId: ALICE, now: at(5_000) } },
    expected: { phase: "racing", changed: false, ignored: "ENTRANT_TERMINAL" },
  },
  {
    name: "the last runner abandoning ends the race: the finisher first, the abandon last",
    input: { state: race({ entrants: [aliceDone, bobHalfway] }), event: { type: "abandon", entrantId: BOB, now: at(5_000) } },
    expected: { phase: "ended", changed: true, statuses: [[BOB, "abandoned"]], ranking: [ALICE, BOB], endedAt: at(5_000) },
  },
  {
    name: "the last abandon during the countdown keeps the countdown until startsAt",
    input: { state: race({ phase: "countdown", clock: at(-3_000), entrants: [runner(ALICE, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_500) }), runner(BOB)] }), event: { type: "abandon", entrantId: BOB, now: at(-1_000) } },
    expected: { phase: "countdown", changed: true, statuses: [[BOB, "abandoned"]], nextDeadline: at(0) },
  },
  {
    name: "a room closed before the race is finalised produces no official result, not even for finishers (D-06)",
    input: { state: race({ entrants: [aliceDone, bobHalfway] }), event: { type: "interrupt", now: at(5_000) } },
    expected: { phase: "interrupted", changed: true },
  },
  {
    name: "a room closed after the race ended keeps its results: the interrupt changes nothing",
    input: { state: race({ phase: "ended", endedAt: at(3_000), clock: at(3_000), entrants: [aliceDone, runner(BOB, { status: "finished", endedAt: at(3_000) })] }), event: { type: "interrupt", now: at(4_000) } },
    expected: { phase: "ended", changed: false },
  },
  {
    name: "a late timer never brings an interrupted race back",
    input: { state: race({ phase: "interrupted", endedAt: at(-1_000), clock: at(-1_000) }), event: { type: "tick", now: at(0) } },
    expected: { phase: "interrupted", changed: false },
  },
  {
    name: "keystrokes after an interruption are refused",
    input: { state: race({ phase: "interrupted", endedAt: at(5_000), clock: at(5_000) }), event: keystrokes("race-1", BOB, 1, "a", 6_000) },
    expected: { phase: "interrupted", changed: false, keystrokes: { outcome: "refused", reason: "NOT_RACING" } },
  },
  {
    name: "on the first path, with no time limit, a tick never ends the race by itself (D-17)",
    input: { state: race(), event: { type: "tick", now: at(3_600_000) } },
    expected: { phase: "racing", changed: false },
  },
  {
    name: "one millisecond before the time limit, the race goes on",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: { type: "tick", now: at(29_999) } },
    expected: { phase: "racing", changed: false, nextDeadline: at(30_000) },
  },
  {
    name: "the time limit ends the race and times out whoever is still racing",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: { type: "tick", now: at(30_000) } },
    expected: { phase: "ended", changed: true, statuses: [[BOB, "timedOut"]], ranking: [ALICE, BOB], endedAt: at(30_000) },
  },
  {
    name: "a late tick ends the race at the deadline, not at the tick",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: { type: "tick", now: at(30_500) } },
    expected: { phase: "ended", changed: true, statuses: [[BOB, "timedOut"]], endedAt: at(30_000), elapsed: [[ALICE, asDuration(2_000)], [BOB, asDuration(30_000)]] },
  },
  {
    name: "a keystroke at the time limit arrives too late: refused, and the race ends once",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: keystrokes("race-1", BOB, 2, "b", 30_000) },
    expected: { phase: "ended", changed: true, keystrokes: { outcome: "refused", reason: "NOT_RACING" }, statuses: [[BOB, "timedOut"]], ranking: [ALICE, BOB] },
  },
  {
    name: "an abandon at the time limit is a time-out: the time limit wins the tie (D-06)",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: { type: "abandon", entrantId: BOB, now: at(30_000) } },
    expected: { phase: "ended", changed: true, ignored: "RACE_OVER", statuses: [[BOB, "timedOut"]] },
  },
  {
    name: "an event earlier than the race clock is handled at the clock: time never runs backwards",
    input: { state: race({ clock: at(5_000) }), event: keystrokes("race-1", BOB, 1, "a", 4_000) },
    expected: { phase: "racing", changed: true, keystrokes: { outcome: "applied" } },
  },
];
