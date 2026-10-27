import type { ContractExample } from "../contract-example";
import { asEntrantId, asRaceId, type EntrantId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, type Duration, type Instant } from "../time";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import type {
  AbandonReason,
  EntrantKeystrokeRefusal,
  EntrantState,
  EntrantStatus,
  KeystrokeResult,
  PresenceIgnored,
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
    lastActivityAt: at(0),
    inactive: false,
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
  readonly ignored?: PresenceIgnored;
  /** The inactive marker of these entrants after the event (D-17). */
  readonly inactive?: readonly (readonly [EntrantId, boolean])[];
  /** These entrants' abandon reason and `endedAt`, after the event. */
  readonly abandons?: readonly (readonly [EntrantId, AbandonReason, Instant])[];
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
      state: race({ phase: "countdown", clock: at(-2_000), entrants: [runner(ALICE, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_500) }), runner(BOB, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-2_000) })] }),
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
    name: "with no time limit there is no hidden cap: an hour in, runners still typing keep racing (CONF-01, D-17)",
    input: { state: race({ clock: at(3_599_000), entrants: [runner(ALICE, { lastActivityAt: at(3_590_000) }), runner(BOB, { lastActivityAt: at(3_598_000) })] }), event: { type: "tick", now: at(3_600_000) } },
    expected: { phase: "racing", changed: false, nextDeadline: at(3_650_000) },
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
    expected: { phase: "ended", changed: true, statuses: [[BOB, "timedOut"]], ranking: [ALICE, BOB], endedAt: at(30_000), elapsed: [[ALICE, asDuration(2_000)], [BOB, asDuration(30_000)]] },
  },
  {
    name: "a keystroke at the time limit arrives too late: refused, and the race ends once",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: keystrokes("race-1", BOB, 2, "b", 30_000) },
    expected: { phase: "ended", changed: true, keystrokes: { outcome: "refused", reason: "NOT_RACING" }, statuses: [[BOB, "timedOut"]], ranking: [ALICE, BOB] },
  },
  {
    name: "an abandon at the time limit is a time-out: the time limit wins the tie (D-06)",
    input: { state: race({ timeLimit: thirtySeconds, entrants: [aliceDone, bobHalfway] }), event: { type: "abandon", entrantId: BOB, now: at(30_000) } },
    expected: { phase: "ended", changed: true, ignored: "RACE_OVER", statuses: [[BOB, "timedOut"]], ranking: [ALICE, BOB] },
  },
  {
    name: "an event earlier than the race clock is handled at the clock: time never runs backwards",
    input: { state: race({ clock: at(5_000) }), event: keystrokes("race-1", BOB, 1, "a", 4_000) },
    expected: { phase: "racing", changed: true, keystrokes: { outcome: "applied" } },
  },
  // F-04.6: the 30-second grace (D-06) and inactivity (D-17). Bob keeps typing unless stated.
  {
    name: "a lost connection resumed exactly at its deadline keeps the runner racing (D-06)",
    input: { state: race({ clock: at(39_000), entrants: [runner(ALICE, { disconnectedAt: at(10_000), lastActivityAt: at(10_000) }), runner(BOB, { lastActivityAt: at(39_000) })] }), event: { type: "connectionResumed", entrantId: ALICE, now: at(40_000) } },
    expected: { phase: "racing", changed: false, statuses: [[ALICE, "racing"]] },
  },
  {
    name: "one millisecond after its deadline, the resumption comes too late: an abandon dated at the deadline",
    input: { state: race({ clock: at(39_000), entrants: [runner(ALICE, { disconnectedAt: at(10_000), lastActivityAt: at(10_000) }), runner(BOB, { lastActivityAt: at(39_000) })] }), event: { type: "connectionResumed", entrantId: ALICE, now: at(40_001) } },
    expected: { phase: "racing", changed: true, ignored: "ENTRANT_TERMINAL", abandons: [[ALICE, "disconnection", at(40_000)]] },
  },
  {
    name: "the inactive marker appears at exactly 60 s without a keystroke, and is broadcast (D-17)",
    input: { state: race({ clock: at(59_000), entrants: [runner(ALICE), runner(BOB, { lastActivityAt: at(59_000) })] }), event: { type: "tick", now: at(60_000) } },
    expected: { phase: "racing", changed: true, inactive: [[ALICE, true], [BOB, false]], nextDeadline: at(119_000) },
  },
  {
    name: "a batch applied at exactly 60 s, even a wrong insert in mandatory correction, lifts the marker in the same handling: nothing to broadcast",
    input: { state: race({ errorMode: "mandatory", clock: at(59_000), entrants: [runner(ALICE), runner(BOB, { lastActivityAt: at(59_000) })] }), event: keystrokes("race-1", ALICE, 1, "x", 60_000) },
    expected: { phase: "racing", changed: false, keystrokes: { outcome: "applied" }, inactive: [[ALICE, false]] },
  },
  {
    name: "a refused or resynced batch is not activity: the marker stays",
    input: { state: race({ clock: at(61_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(61_000) })] }), event: keystrokes("race-1", ALICE, 5, "a", 62_000) },
    expected: { phase: "racing", changed: false, keystrokes: { outcome: "resync", reason: "OUT_OF_ORDER" }, inactive: [[ALICE, true]] },
  },
  {
    name: "« Je suis là » at exactly 120 s still counts: the runner is back in the race (D-17)",
    input: { state: race({ clock: at(119_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(119_000) })] }), event: { type: "present", entrantId: ALICE, now: at(120_000) } },
    expected: { phase: "racing", changed: true, statuses: [[ALICE, "racing"]], inactive: [[ALICE, false]] },
  },
  {
    name: "without a reaction, the runner abandons for inactivity, dated at 120 s",
    input: { state: race({ clock: at(119_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(119_000) })] }), event: { type: "tick", now: at(120_001) } },
    expected: { phase: "racing", changed: true, abandons: [[ALICE, "inactivity", at(120_000)]] },
  },
  {
    name: "a resumption alone does not reset the inactivity (D-17)",
    input: { state: race({ clock: at(109_000), entrants: [runner(ALICE, { inactive: true, disconnectedAt: at(100_000) }), runner(BOB, { lastActivityAt: at(109_000) })] }), event: { type: "connectionResumed", entrantId: ALICE, now: at(110_000) } },
    expected: { phase: "racing", changed: false, inactive: [[ALICE, true]], nextDeadline: at(120_001) },
  },
  {
    name: "the deadlines are independent: an inactivity that expires before the grace wins",
    input: { state: race({ clock: at(101_000), entrants: [runner(ALICE, { inactive: true, disconnectedAt: at(100_000) }), runner(BOB, { lastActivityAt: at(129_000) })] }), event: { type: "tick", now: at(130_001) } },
    expected: { phase: "racing", changed: true, abandons: [[ALICE, "inactivity", at(120_000)]] },
  },
  {
    name: "a grace and an inactivity expiring at the same instant: the reason is disconnection",
    input: { state: race({ clock: at(91_000), entrants: [runner(ALICE, { inactive: true, disconnectedAt: at(90_000) }), runner(BOB, { lastActivityAt: at(119_000) })] }), event: { type: "tick", now: at(120_001) } },
    expected: { phase: "racing", changed: true, abandons: [[ALICE, "disconnection", at(120_000)]] },
  },
  {
    name: "the time limit wins a tie with the grace: a time-out, not an abandon (D-06)",
    input: { state: race({ timeLimit: thirtySeconds, clock: at(1_000), entrants: [runner(ALICE, { disconnectedAt: at(0) }), runner(BOB, { lastActivityAt: at(1_000) })] }), event: { type: "tick", now: at(30_001) } },
    expected: { phase: "ended", changed: true, statuses: [[ALICE, "timedOut"], [BOB, "timedOut"]], ranking: [ALICE, BOB], endedAt: at(30_000) },
  },
  {
    name: "the time limit wins a tie with the inactivity too",
    input: { state: race({ timeLimit: asDuration(120_000), clock: at(119_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(119_000) })] }), event: { type: "tick", now: at(120_001) } },
    expected: { phase: "ended", changed: true, statuses: [[ALICE, "timedOut"], [BOB, "timedOut"]], endedAt: at(120_000), ranking: [ALICE, BOB] },
  },
  {
    name: "a late tick after everyone abandoned before the time limit ends the race at the last abandon, never with time-outs",
    input: { state: race({ timeLimit: asDuration(600_000), clock: at(21_000), entrants: [runner(ALICE, { disconnectedAt: at(10_000) }), runner(BOB, { disconnectedAt: at(20_000) })] }), event: { type: "tick", now: at(700_000) } },
    expected: { phase: "ended", changed: true, abandons: [[ALICE, "disconnection", at(40_000)], [BOB, "disconnection", at(50_000)]], endedAt: at(50_000), ranking: [ALICE, BOB] },
  },
  {
    name: "a connection lost during the countdown: the grace runs and the race still starts on time",
    input: { state: countdown, event: { type: "connectionLost", entrantId: BOB, now: at(-2_000) } },
    expected: { phase: "countdown", changed: false, statuses: [[BOB, "racing"]], nextDeadline: at(0) },
  },
  {
    name: "a second loss changes nothing: the first grace keeps running",
    input: { state: race({ entrants: [runner(ALICE, { disconnectedAt: at(0) }), runner(BOB)] }), event: { type: "connectionLost", entrantId: ALICE, now: at(1_000) } },
    expected: { phase: "racing", changed: false, ignored: "ALREADY_DISCONNECTED" },
  },
  {
    name: "a bot is never inactive and never disconnected (D-17)",
    input: { state: race({ clock: at(499_000), entrants: [runner(ALICE, { lastActivityAt: at(499_000) }), runner(BOB, { kind: "bot" })] }), event: { type: "connectionLost", entrantId: BOB, now: at(500_000) } },
    expected: { phase: "racing", changed: false, ignored: "BOT_ENTRANT", statuses: [[BOB, "racing"]], inactive: [[BOB, false]] },
  },
  // D-17, ADR-0004 (F-04.6a): inactivity does not run while the server cannot accept answers.
  {
    name: "while the lease is suspended, 60 s without a keystroke shows no marker, and no inactivity deadline is due",
    input: { state: race({ timeLimit: asDuration(600_000), inactivityPausedAt: at(50_000), clock: at(59_000) }), event: { type: "tick", now: at(60_000) } },
    expected: { phase: "racing", changed: false, inactive: [[ALICE, false], [BOB, false]], nextDeadline: at(600_000) },
  },
  {
    name: "while the lease is suspended, 120 s without a keystroke is no abandon: a marker already shown stays",
    input: { state: race({ inactivityPausedAt: at(100_000), clock: at(119_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(99_000) })] }), event: { type: "tick", now: at(150_000) } },
    expected: { phase: "racing", changed: false, statuses: [[ALICE, "racing"]], inactive: [[ALICE, true]] },
  },
  {
    name: "a suspension reported late counts from its start: no inactivity abandon after it",
    input: { state: race({ clock: at(100_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(100_000) })] }), event: { type: "inactivityPaused", since: at(110_000), now: at(130_000) } },
    expected: { phase: "racing", changed: false, statuses: [[ALICE, "racing"]], inactive: [[ALICE, true]] },
  },
  {
    name: "a suspension from exactly 120 s comes first: the runner could not answer at that instant, so no abandon",
    input: { state: race({ clock: at(100_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(100_000) })] }), event: { type: "inactivityPaused", since: at(120_000), now: at(130_000) } },
    expected: { phase: "racing", changed: false, statuses: [[ALICE, "racing"]] },
  },
  {
    name: "a suspension from one millisecond after 120 s keeps the abandon acquired before it",
    input: { state: race({ clock: at(100_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(100_000) })] }), event: { type: "inactivityPaused", since: at(120_001), now: at(130_000) } },
    expected: { phase: "racing", changed: true, abandons: [[ALICE, "inactivity", at(120_000)]] },
  },
  {
    name: "a suspension reported late still shows the marker due before it, from exactly 60 s",
    input: { state: race({ clock: at(50_000), entrants: [runner(ALICE), runner(BOB, { lastActivityAt: at(50_000) })] }), event: { type: "inactivityPaused", since: at(60_000), now: at(70_000) } },
    expected: { phase: "racing", changed: true, inactive: [[ALICE, true], [BOB, false]] },
  },
  {
    name: "a suspension from one millisecond before 60 s shows no marker",
    input: { state: race({ clock: at(50_000), entrants: [runner(ALICE), runner(BOB, { lastActivityAt: at(50_000) })] }), event: { type: "inactivityPaused", since: at(59_999), now: at(70_000) } },
    expected: { phase: "racing", changed: false, inactive: [[ALICE, false], [BOB, false]] },
  },
  {
    name: "the resume gives back exactly the inactivity time left: the abandon moves by the suspended time, the marker stays",
    input: { state: race({ inactivityPausedAt: at(100_000), clock: at(130_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { lastActivityAt: at(99_000) })] }), event: { type: "inactivityResumed", now: at(130_000) } },
    expected: { phase: "racing", changed: false, inactive: [[ALICE, true]], nextDeadline: at(150_001) },
  },
  {
    name: "a resume without a suspension changes nothing",
    input: { state: race({ clock: at(30_000) }), event: { type: "inactivityResumed", now: at(30_000) } },
    expected: { phase: "racing", changed: false, inactive: [[ALICE, false]], nextDeadline: at(60_000) },
  },
  {
    name: "the time limit keeps running during a suspension and ends the race",
    input: { state: race({ timeLimit: asDuration(600_000), inactivityPausedAt: at(100_000), clock: at(599_000), entrants: [runner(ALICE, { inactive: true }), runner(BOB, { inactive: true, lastActivityAt: at(99_000) })] }), event: { type: "tick", now: at(600_001) } },
    expected: { phase: "ended", changed: true, statuses: [[ALICE, "timedOut"], [BOB, "timedOut"]], endedAt: at(600_000), ranking: [ALICE, BOB] },
  },
  {
    name: "the 30 s grace keeps running during a suspension: a disconnection abandon, where inactivity would have come first (D-06)",
    input: { state: race({ inactivityPausedAt: at(100_000), clock: at(106_000), entrants: [runner(ALICE, { inactive: true, disconnectedAt: at(105_000) }), runner(BOB, { lastActivityAt: at(99_000) })] }), event: { type: "tick", now: at(140_000) } },
    expected: { phase: "racing", changed: true, abandons: [[ALICE, "disconnection", at(135_000)]] },
  },
  {
    name: "a suspension during the countdown: the race still starts on time",
    input: { state: countdown, event: { type: "inactivityPaused", since: at(-1_000), now: at(1_000) } },
    expected: { phase: "racing", changed: true, statuses: [[ALICE, "racing"], [BOB, "racing"]] },
  },
  {
    name: "a suspension after the race ended changes nothing",
    input: { state: race({ phase: "ended", endedAt: at(2_000), clock: at(2_000), entrants: [aliceDone, runner(BOB, { status: "abandoned", abandonReason: "voluntary", endedAt: at(1_000) })] }), event: { type: "inactivityPaused", since: at(3_000), now: at(3_000) } },
    expected: { phase: "ended", changed: false },
  },
];
