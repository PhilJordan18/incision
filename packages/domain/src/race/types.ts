/**
 * Contract of the race engine for the first race path (F-00.3): a race on a fixed text, from the
 * countdown to the results. Types only; the functions arrive with their cards (F-02.1, F-02.2,
 * F-04.1, F-04.4) and nothing in the application may stand in for them. Later cards extend
 * `RaceEvent` (grace period, inactivity, bonuses, bots) and `EntrantResult` (the WPM series, sampled
 * by the engine in F-07.3 and stored in F-07.1; the bonuses received, in F-06) through engine pull
 * requests. Until then RES-05 stays partial, and a series is never rebuilt from a final score. The
 * rules are summarised in the README.
 *
 * Four counters, never mixed up:
 * - `raceId`: which race a message belongs to. Another race is refused.
 * - `seq`: the entrant's own batch sequence, from 1. `ackSeq` is the last one applied.
 * - `textVersion`: the version of the entrant's own effective text (0 for the initial text). It
 *   changes only when a bonus changes that entrant's text, never because of another player.
 * - `revision`: the broadcast revision of the race, from 0. Clients keep the highest revision for
 *   the current `raceId` and drop stale snapshots. It is never a reason to refuse keystrokes.
 */
import type { EntrantId, RaceId } from "../ids";
import type { Measures, TypingCounters } from "../measures/types";
import type { Duration, Instant } from "../time";
import type { EntrantKind, StartRefusal } from "./start";

/**
 * CONF-08. Both modes are offered; mandatory correction is the default (D-19). Free mode lets a
 * player advance despite errors, which stay counted; mandatory correction never advances past an
 * error, which limits random key-mashing without being a general guarantee against cheating.
 */
export const ERROR_MODES = ["free", "mandatory"] as const;
export type ErrorMode = (typeof ERROR_MODES)[number];

/**
 * Phases of one race. The room phase (waiting, countdown, racing, results, closed) lives in the
 * database and is changed by the server under the room lock; this is the in-memory race.
 */
export type RacePhase = "countdown" | "racing" | "ended" | "interrupted";

export type EntrantStatus = "racing" | "finished" | "timedOut" | "abandoned";
export type TerminalStatus = Exclude<EntrantStatus, "racing">;

/** Why an entrant abandoned: confirmed by them (COURSE-07), lost connection (COURSE-08), inactivity (D-17). */
export type AbandonReason = "voluntary" | "disconnection" | "inactivity";

/**
 * What a player's keyboard produced, in order. An `insert` carries exactly one grapheme, after any
 * input-method composition, of at most `MAX_GRAPHEME_LENGTH` code units as received (its NFC form
 * may be longer); a deletion carries nothing. Navigation keys are never sent.
 */
export type InputEvent =
  | { readonly type: "insert"; readonly grapheme: string }
  | { readonly type: "deleteBackward" };

/**
 * One batch of keystrokes, as the engine receives it. The server builds it from the client's
 * payload: `entrantId` comes from the authenticated socket, never from the payload, and the
 * server's `now` times it.
 *
 * `seq` is a safe integer of at least 1, `textVersion` a safe integer of at least 0, and `events`
 * holds at least one event; otherwise the batch is refused `INVALID_INPUT`. More than
 * `MAX_BATCH_EVENTS` events are refused `BATCH_TOO_LARGE`.
 */
export type KeystrokeBatch = {
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  /** 1 for the entrant's first batch, then +1 per batch applied. */
  readonly seq: number;
  /** The entrant's text version the client typed against. */
  readonly textVersion: number;
  readonly events: readonly InputEvent[];
};

/**
 * One entrant's private typing state, held by the server.
 *
 * - Free mode: a wrong insert enters `typed` and counts as an error; `deleteBackward` removes the
 *   last grapheme, which allows a correction (D-09), and does nothing at position 0. The position
 *   is `typed.length`, errors included, and the entrant finishes when it reaches the target length.
 * - Mandatory correction: `typed` is always a correct prefix of the target. A wrong insert counts
 *   as an error, is never inserted, and sets `pendingError`, so the expected grapheme shows in
 *   error until the right one is typed (design screen 09). `deleteBackward` clears a pending error
 *   or, without one, removes the last grapheme.
 *
 * Every event after the finishing insert, in the same batch, is discarded: it is neither applied
 * nor counted, and it does not count toward the plausibility total.
 */
export type EntrantState = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
  /** The effective target text, in graphemes. */
  readonly target: readonly string[];
  readonly textVersion: number;
  readonly typed: readonly string[];
  readonly pendingError: boolean;
  readonly counters: TypingCounters;
  /** Wrong inserts per expected grapheme, for the missed-keys heatmap (RES-03). */
  readonly missedKeys: Readonly<Record<string, number>>;
  /** Last batch applied; 0 before the first. */
  readonly ackSeq: number;
  readonly status: EntrantStatus;
  /** When the entrant finished, timed out or abandoned; a time-out ends at the deadline, not later. */
  readonly endedAt?: Instant;
  readonly abandonReason?: AbandonReason;
};

export type RaceState = {
  readonly raceId: RaceId;
  /** Broadcast revision: 0 at creation, +1 for every change other people can see. */
  readonly revision: number;
  readonly phase: RacePhase;
  readonly errorMode: ErrorMode;
  /**
   * CONF-01: null means no time limit at all (D-17); otherwise a configured duration from
   * TIME_LIMIT_MIN_MS to TIME_LIMIT_MAX_MS, announced before the start and shown during the race.
   */
  readonly timeLimit: Duration | null;
  /** When the text was revealed and the countdown began (COURSE-03). */
  readonly countdownAt: Instant;
  /** `countdownAt` + COUNTDOWN_MS: the common start; no keystroke is accepted before it. */
  readonly startsAt: Instant;
  readonly endedAt?: Instant;
  /**
   * The latest instant the race has processed. The server injects a monotonic clock; an event
   * whose `now` is earlier is handled at `clock`, so time never runs backwards inside a race.
   */
  readonly clock: Instant;
  /** The race text as revealed, in graphemes. */
  readonly text: readonly string[];
  /** Frozen at creation, in registration order; spectators are never entrants. */
  readonly entrants: readonly EntrantState[];
};

export type CreateRaceInput = {
  readonly raceId: RaceId;
  readonly text: string;
  readonly errorMode: ErrorMode;
  readonly timeLimit: Duration | null;
  /** The room's participants, read under the room lock, with their server-resolved ids. */
  readonly participants: readonly { readonly entrantId: EntrantId; readonly kind: EntrantKind }[];
  /** The server's instant when the host starts: the countdown begins now. */
  readonly now: Instant;
};

export type CreateRaceRefusal = StartRefusal | "EMPTY_TEXT" | "TEXT_TOO_LONG" | "DUPLICATE_ENTRANT" | "INVALID_TIME_LIMIT";

export type CreateRaceResult =
  | { readonly ok: true; readonly race: RaceState }
  | { readonly ok: false; readonly reason: CreateRaceRefusal };

/**
 * Contract of F-04.1 (engine half). Applies `startRefusal`, never a copy of it. An accepted race
 * starts in `countdown`, revision 0, `clock` = `countdownAt` = `now`, `startsAt` = `now` +
 * COUNTDOWN_MS, every entrant racing with `textVersion` 0 and `ackSeq` 0.
 */
export type CreateRace = (input: CreateRaceInput) => CreateRaceResult;

/**
 * First-path events. Later cards add the grace period, inactivity, bonuses and bots.
 *
 * Before and after handling any event, the reducer applies every transition due at its `now`, so a
 * late timer never decides a result (docs/architecture/state-machines.md §3):
 * 1. `countdown` → `racing` once `now >= startsAt`;
 * 2. with a time limit, `racing` → `ended` once `now >= startsAt + timeLimit`: entrants still racing
 *    time out with `endedAt` = that deadline. The time limit wins a tie with any other deadline (D-06);
 * 3. a race whose entrants are all terminal ends, at the latest of `startsAt` and the last `endedAt`,
 *    never from `countdown`: when everyone abandons during the countdown, it ends at `startsAt`, with
 *    every entrant an abandon, zero elapsed time and zero measures; the countdown never counts as
 *    typing time.
 *
 * An `ended` or `interrupted` race is final: no later event, a late timer included, changes it.
 */
export type RaceEvent =
  /** Lets due transitions happen when nothing else arrives; the runtime schedules it at `nextDeadline`. */
  | { readonly type: "tick"; readonly now: Instant }
  | { readonly type: "keystrokes"; readonly batch: KeystrokeBatch; readonly now: Instant }
  /** Confirmed abandon (COURSE-07), allowed during the countdown and the race. */
  | { readonly type: "abandon"; readonly entrantId: EntrantId; readonly now: Instant }
  /**
   * The room closes before the race is finalised: the race produces no official result (D-06), and
   * the performances held in memory are never persisted. A race already `ended` keeps its results:
   * an `interrupt` after the end changes nothing. When closing and finalising compete, the server
   * lets one transaction win under the room lock. After a server restart the race no longer exists
   * in memory and no event is involved.
   */
  | { readonly type: "interrupt"; readonly now: Instant };

/** Refusals that leave the client without a usable entrant state: it reloads the race. */
export type RaceKeystrokeRefusal = "WRONG_RACE" | "UNKNOWN_ENTRANT";

/** Refusals of a known entrant's batch; the reply carries a snapshot to continue from. */
export type EntrantKeystrokeRefusal =
  | "NOT_RACING"
  | "ENTRANT_TERMINAL"
  | "BATCH_TOO_LARGE"
  | "INVALID_INPUT"
  | "IMPLAUSIBLE";

/** The batch cannot be applied without ambiguity; nothing was applied. */
export type ResyncReason = "OUT_OF_ORDER" | "TEXT_VERSION_CHANGED";

/**
 * The reply to the sender of a batch; `seq` echoes the batch it answers. A batch is applied whole
 * or not at all, and a refusal never consumes a `seq`.
 *
 * Client rules, with one batch in flight (`MAX_BATCHES_IN_FLIGHT`). A batch is immutable once sent:
 * a retry repeats the same `seq` with the same events, and a `seq` is never reused for other events.
 * - `applied`: the next batch is `ackSeq + 1`.
 * - `duplicate`: that very batch had already been applied; the next batch is `ackSeq + 1`.
 * - `resync`, or `refused` with a snapshot: drop the unapplied keystrokes, rebuild the typing zone
 *   from the snapshot, and continue at `snapshot.ackSeq + 1`.
 * - `refused` without a snapshot (`WRONG_RACE`, `UNKNOWN_ENTRANT`): reload the race.
 * - After a reconnection, wait for the snapshot. The batch that was in flight counts as applied if
 *   and only if `snapshot.ackSeq >= its seq`; otherwise resend it unchanged and keep its events shown
 *   on top of the snapshot. A copy flushed late by the transport then gets `duplicate`, harmlessly.
 *
 * Checks, in this order: race, entrant (in `reduceRace`), then in `applyKeystrokes`: shape of the
 * batch (`INVALID_INPUT`), duplicate (`seq <= ackSeq`), phase and entrant status, gap
 * (`seq !== ackSeq + 1`), text version (any difference), size, each input, plausibility of the
 * new total. A retry of the last batch therefore gets `duplicate` even after the race ended.
 */
export type KeystrokeResult =
  | { readonly outcome: "applied"; readonly seq: number; readonly ackSeq: number; readonly textVersion: number }
  /** Already applied (a retry): nothing changes. */
  | { readonly outcome: "duplicate"; readonly seq: number; readonly ackSeq: number }
  | { readonly outcome: "resync"; readonly seq: number; readonly reason: ResyncReason; readonly snapshot: EntrantSnapshot }
  | { readonly outcome: "refused"; readonly seq: number; readonly reason: RaceKeystrokeRefusal }
  | { readonly outcome: "refused"; readonly seq: number; readonly reason: EntrantKeystrokeRefusal; readonly snapshot: EntrantSnapshot };

/** Why an `abandon` event changed nothing. */
export type AbandonIgnored = "UNKNOWN_ENTRANT" | "ENTRANT_TERMINAL" | "RACE_OVER";

/** What the race reducer returns. */
export type RaceOutput = {
  readonly state: RaceState;
  /** True when `revision` moved: the server broadcasts the public progress. */
  readonly changed: boolean;
  /** For a `keystrokes` event: the reply to its sender. */
  readonly keystrokes?: KeystrokeResult;
  /** For an `abandon` event that changed nothing. */
  readonly ignored?: AbandonIgnored;
  /**
   * Exactly once, on the transition to `ended`. The server writes it in one transaction with the
   * room's move to results, and broadcasts only after the commit.
   */
  readonly ended?: RaceEnd;
  /** The next instant at which a `tick` would change something (start, time limit), if any. */
  readonly nextDeadline?: Instant;
};

/** Contract of F-04.1 (engine half). Pure: same state and event, same output. */
export type ReduceRace = (state: RaceState, event: RaceEvent) => RaceOutput;

export type KeystrokeContext = {
  readonly errorMode: ErrorMode;
  /** The race phase once due transitions are applied: only `racing` accepts keystrokes. */
  readonly phase: RacePhase;
  readonly startsAt: Instant;
  readonly now: Instant;
};

export type EntrantKeystrokeResult = {
  readonly entrant: EntrantState;
  readonly result: KeystrokeResult;
};

/**
 * Contract of F-04.4 (engine half): every check after the race and the entrant are resolved, then
 * the application, as `reduceRace` calls it.
 */
export type ApplyKeystrokes = (entrant: EntrantState, batch: KeystrokeBatch, context: KeystrokeContext) => EntrantKeystrokeResult;

/** Sent when the countdown begins (COURSE-03), and again to a member who reconnects; never before. */
export type RaceReveal = {
  readonly raceId: RaceId;
  readonly text: readonly string[];
  readonly errorMode: ErrorMode;
  readonly countdownAt: Instant;
  readonly startsAt: Instant;
  readonly timeLimit: Duration | null;
};

/** Contract of F-04.1 (engine half). */
export type ToRaceReveal = (state: RaceState) => RaceReveal;

/** One entrant on the track, as everyone in the room sees it (COURSE-05). */
export type PublicEntrantProgress = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
  readonly status: EntrantStatus;
  /** Progress is `position / length` (Appendix A). */
  readonly position: number;
  readonly length: number;
  /** Net WPM over `measuredElapsed`: 0 during the countdown, frozen once the entrant ended. */
  readonly netWpm: number;
  readonly endedAt?: Instant;
};

/** The race's public state, broadcast after each change; clients keep the highest revision of the current race. */
export type RaceBroadcast = {
  readonly raceId: RaceId;
  readonly revision: number;
  readonly phase: RacePhase;
  readonly startsAt: Instant;
  readonly endedAt?: Instant;
  readonly timeLimit: Duration | null;
  readonly entrants: readonly PublicEntrantProgress[];
};

/** Contract of F-04.1 (engine half): the public view at the later of `now` and `state.clock`. */
export type ToRaceBroadcast = (state: RaceState, now: Instant) => RaceBroadcast;

/**
 * The private snapshot that rebuilds one player's typing zone, after a resync, a refusal or a
 * reconnection (with the `RaceReveal`). Sent to that player only.
 */
export type EntrantSnapshot = {
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  readonly textVersion: number;
  readonly target: readonly string[];
  readonly typed: readonly string[];
  readonly pendingError: boolean;
  readonly ackSeq: number;
  readonly status: EntrantStatus;
  readonly counters: TypingCounters;
};

/** Contract of F-04.4 (engine half): undefined for an entrant the race does not know. */
export type ToEntrantSnapshot = (state: RaceState, entrantId: EntrantId) => EntrantSnapshot | undefined;

/** What the ranking needs of each entrant, once every entrant is terminal. */
export type RankInput = {
  readonly entrantId: EntrantId;
  readonly status: TerminalStatus;
  readonly endedAt: Instant;
  readonly position: number;
  readonly length: number;
  readonly accuracy: number;
};

export type RankedEntrant = {
  readonly entrantId: EntrantId;
  /** Exactly 1 to n over the n entrants, each rank once: no shared rank. */
  readonly rank: number;
};

/**
 * Contract of F-02.2 (COURSE-10): finishers by arrival (`endedAt`), then time-outs by progress,
 * then abandons by progress at the abandon. Exact ties: higher accuracy first, then `compareIds`,
 * so every tie is broken. Progress compares exactly (`position × otherLength` against
 * `otherPosition × length`).
 */
export type RankEntrants = (entrants: readonly RankInput[]) => readonly RankedEntrant[];

/**
 * One entrant's final result, as the server persists it (RES-02). Every value is bounded:
 * WPM ≤ `MAX_WPM`, accuracy in [0, 100], counters ≤ `MAX_ENTRANT_INSERTS`,
 * position ≤ length ≤ `MAX_TEXT_GRAPHEMES`, elapsed ≤ `MAX_DURATION_MS`.
 * The WPM series (RES-05) arrives with F-07.1 and the bonuses received with F-06.
 */
export type EntrantResult = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
  readonly rank: number;
  readonly status: TerminalStatus;
  readonly abandonReason?: AbandonReason;
  /** `measuredElapsed` at the entrant's end: 0 for an abandon during the countdown. */
  readonly elapsed: Duration;
  readonly position: number;
  readonly length: number;
  readonly counters: TypingCounters;
  /** `totalInserts - correctInserts`. */
  readonly errors: number;
  readonly measures: Measures;
  readonly missedKeys: Readonly<Record<string, number>>;
};

/**
 * The official results of a race, produced once when it ends normally. A race in which nobody
 * finished (everyone abandoned or timed out) awards no victory and no record (D-24, D-12).
 */
export type RaceEnd = {
  readonly raceId: RaceId;
  readonly endedAt: Instant;
  /** Ordered by rank. */
  readonly results: readonly EntrantResult[];
};
