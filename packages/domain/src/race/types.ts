/**
 * Contract of the race engine for the first race path (F-00.3): a race on a fixed text, from the
 * countdown to the results. Types only; the functions arrive with their cards (F-02.1, F-02.2,
 * F-04.1, F-04.4) and nothing in the application may stand in for them. Later cards extend
 * `RaceEvent` (grace period, inactivity, bonuses, bots) through engine pull requests.
 *
 * Four counters, never mixed up:
 * - `raceId`: which race a message belongs to. Another race is refused.
 * - `seq`: the entrant's own batch sequence, from 1. `ackSeq` is the last one applied.
 * - `textVersion`: the version of the entrant's own effective text (0 for the initial text). It
 *   changes only when a bonus changes that entrant's text, never because of another player.
 * - `revision`: the broadcast revision of the whole race, so clients can drop a stale snapshot.
 *   It is never a reason to refuse keystrokes.
 */
import type { EntrantId, RaceId } from "../ids";
import type { Measures, TypingCounters } from "../measures/types";
import type { Duration, Instant } from "../time";
import type { EntrantKind, StartRefusal } from "./start";

/** CONF-08. */
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
 * What a player's keyboard produced, in order. An `insert` carries exactly one grapheme after
 * any input-method composition; a deletion carries nothing. Navigation keys are never sent.
 */
export type InputEvent =
  | { readonly type: "insert"; readonly grapheme: string }
  | { readonly type: "deleteBackward" };

/**
 * One batch of keystrokes, as the engine receives it. The server builds it from the client's
 * payload: `entrantId` comes from the authenticated socket, never from the payload, and the
 * server's `now` times it. At most `MAX_BATCH_EVENTS` events, `MAX_BATCHES_PER_SECOND` per player.
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
 *   last grapheme, which allows a correction (D-09). The position is `typed.length`, errors
 *   included, and the entrant finishes when it reaches the target length.
 * - Mandatory correction: `typed` is always a correct prefix of the target. A wrong insert counts
 *   as an error, is never inserted, and sets `pendingError`, so the expected grapheme shows in
 *   error until the right one is typed (design screen 09). `deleteBackward` clears a pending error
 *   or, without one, removes the last grapheme.
 *
 * Inserts arriving after the entrant finished, in the same batch, are discarded and not counted.
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
  /** When the entrant finished, timed out or abandoned. */
  readonly endedAt?: Instant;
  readonly abandonReason?: AbandonReason;
};

export type RaceState = {
  readonly raceId: RaceId;
  /** Broadcast revision: +1 for every change other people can see. */
  readonly revision: number;
  readonly phase: RacePhase;
  readonly errorMode: ErrorMode;
  /** CONF-01: null means no time limit at all (D-17); otherwise TIME_LIMIT_MIN_MS to TIME_LIMIT_MAX_MS. */
  readonly timeLimit: Duration | null;
  /** When the text was revealed and the countdown began (COURSE-03). */
  readonly countdownAt: Instant;
  /** `countdownAt` + COUNTDOWN_MS: the common start; no keystroke is accepted before it. */
  readonly startsAt: Instant;
  readonly endedAt?: Instant;
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

/** Contract of F-04.1 (engine half): applies `startRefusal`, never a copy of it. */
export type CreateRace = (input: CreateRaceInput) => CreateRaceResult;

/** First-path events. Later cards add the grace period, inactivity, bonuses and bots. */
export type RaceEvent =
  /** Lets timers act: COUNTDOWN_MS elapsed starts the race; the time limit, if any, ends it. */
  | { readonly type: "tick"; readonly now: Instant }
  | { readonly type: "keystrokes"; readonly batch: KeystrokeBatch; readonly now: Instant }
  /** Confirmed abandon (COURSE-07), allowed during the countdown and the race. */
  | { readonly type: "abandon"; readonly entrantId: EntrantId; readonly now: Instant }
  /** The race cannot go on (server restart, room closed): no results are produced (D-06). */
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
 * The reply to the sender of a batch. A batch is applied whole or not at all, and a refusal never
 * consumes a `seq`: after any reply other than `applied`, the client rebuilds its typing zone from
 * the snapshot (when there is one) and sends its next batch with `seq = ackSeq + 1`.
 *
 * Checks, in this order: race, entrant, duplicate (`seq <= ackSeq`), phase and entrant status,
 * gap (`seq > ackSeq + 1`), text version, size, each input, plausibility of the new total.
 */
export type KeystrokeResult =
  | { readonly outcome: "applied"; readonly ackSeq: number; readonly textVersion: number }
  /** Already applied (a retry): nothing changes. */
  | { readonly outcome: "duplicate"; readonly ackSeq: number }
  | { readonly outcome: "resync"; readonly reason: ResyncReason; readonly snapshot: EntrantSnapshot }
  | { readonly outcome: "refused"; readonly reason: RaceKeystrokeRefusal }
  | { readonly outcome: "refused"; readonly reason: EntrantKeystrokeRefusal; readonly snapshot: EntrantSnapshot };

/** What the race reducer returns. */
export type RaceOutput = {
  readonly state: RaceState;
  /** True when `revision` moved: the server broadcasts the public progress. */
  readonly changed: boolean;
  /** For a `keystrokes` event: the reply to its sender. */
  readonly keystrokes?: KeystrokeResult;
  /** For an `abandon` event that changed nothing. */
  readonly ignored?: "UNKNOWN_ENTRANT" | "ENTRANT_TERMINAL" | "NOT_RUNNING";
  /**
   * Exactly once, on the transition to `ended`. The server writes it in one transaction with the
   * room's move to results, and broadcasts only after the commit.
   */
  readonly ended?: RaceEnd;
};

/** Contract of F-04.1 (engine half). Pure: same state and event, same output. */
export type ReduceRace = (state: RaceState, event: RaceEvent) => RaceOutput;

export type KeystrokeContext = {
  readonly errorMode: ErrorMode;
  readonly startsAt: Instant;
  readonly now: Instant;
};

export type EntrantKeystrokeResult = {
  readonly entrant: EntrantState;
  readonly result: KeystrokeResult;
};

/**
 * Contract of F-04.4 (engine half): the entrant-level checks and application used by
 * `reduceRace`, once the race and the entrant are known and the race is running.
 */
export type ApplyKeystrokes = (entrant: EntrantState, batch: KeystrokeBatch, context: KeystrokeContext) => EntrantKeystrokeResult;

/** Sent once, when the countdown begins (COURSE-03): the text is never sent before. */
export type RaceReveal = {
  readonly raceId: RaceId;
  readonly text: readonly string[];
  readonly errorMode: ErrorMode;
  readonly countdownAt: Instant;
  readonly startsAt: Instant;
  readonly timeLimit: Duration | null;
};

/** One entrant on the track, as everyone in the room sees it (COURSE-05). */
export type PublicEntrantProgress = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
  readonly status: EntrantStatus;
  /** Progress is `position / length` (Appendix A). */
  readonly position: number;
  readonly length: number;
  /** Current net WPM from the server's elapsed time. */
  readonly netWpm: number;
  readonly endedAt?: Instant;
};

/** The race's public state, broadcast after each change; clients keep the highest revision. */
export type RaceBroadcast = {
  readonly raceId: RaceId;
  readonly revision: number;
  readonly phase: RacePhase;
  readonly startsAt: Instant;
  readonly endedAt?: Instant;
  readonly timeLimit: Duration | null;
  readonly entrants: readonly PublicEntrantProgress[];
};

/** Contract of F-04.1 (engine half): the public view of a state at the server's `now`. */
export type ToRaceBroadcast = (state: RaceState, now: Instant) => RaceBroadcast;

/**
 * The private snapshot that rebuilds one player's typing zone, after a resync, a refusal or a
 * reconnection. Sent to that player only.
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
  /** 1 for the winner; every rank is distinct. */
  readonly rank: number;
};

/**
 * Contract of F-02.2 (COURSE-10): finishers by arrival (`endedAt`), then time-outs by progress,
 * then abandons by progress at the abandon. Exact ties: higher accuracy first, then `compareIds`.
 * Progress compares exactly (`position × otherLength` against `otherPosition × length`).
 */
export type RankEntrants = (entrants: readonly RankInput[]) => readonly RankedEntrant[];

/** One entrant's final result, as the server persists it (RES-02, RES-05). */
export type EntrantResult = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
  readonly rank: number;
  readonly status: TerminalStatus;
  readonly abandonReason?: AbandonReason;
  /** From `startsAt` to the entrant's `endedAt`. */
  readonly elapsed: Duration;
  readonly position: number;
  readonly length: number;
  readonly counters: TypingCounters;
  /** `totalInserts - correctInserts`. */
  readonly errors: number;
  readonly measures: Measures;
  readonly missedKeys: Readonly<Record<string, number>>;
};

export type RaceEnd = {
  readonly raceId: RaceId;
  readonly endedAt: Instant;
  /** Ordered by rank. */
  readonly results: readonly EntrantResult[];
};
