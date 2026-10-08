import type { Duration } from "../time";

/**
 * Limits shared by the engine and the server (and respected by the E2E tests, with no bypass).
 * The plausibility values are initial; F-04.4 tunes them against the bots and the load test.
 */

/** COURSE-02: at least two participants, at least one of them human. */
export const RACE_MIN_PARTICIPANTS = 2;

/** COURSE-03: the 3-2-1 countdown, from the reveal of the text to the common start. */
export const COUNTDOWN_MS = 3_000;

/** COURSE-08, D-06: a lost connection may resume up to and including this delay. */
export const RESUME_GRACE_MS = 30_000;

/** D-17: no keystroke for this long shows « Tu es toujours là ? »… */
export const INACTIVITY_WARNING_MS = 60_000;
/** …and at this one, without a keystroke or « Je suis là », the runner abandons. */
export const INACTIVITY_ABANDON_MS = 120_000;

/** CONF-01: a time limit, when there is one, lies in this range. "None" has no limit at all (D-17). */
export const TIME_LIMIT_MIN_MS = 30_000;
export const TIME_LIMIT_MAX_MS = 600_000;

/** Longest race text, in graphemes: 200 words (CONF-04, D-19) of long words with their spaces. */
export const MAX_TEXT_GRAPHEMES = 2_000;

/** PERF-02: at most this many keystroke batches per second per player, enforced by the transport. */
export const MAX_BATCHES_PER_SECOND = 10;

/** Most events one batch may carry; a client flushing after a network stall stays well below. */
export const MAX_BATCH_EVENTS = 64;

/** Sustained insert rate above which progress is implausible (COURSE-06): 25 per second, about 300 WPM. */
export const MAX_PLAUSIBLE_INSERTS_PER_SECOND = 25;

/** Inserts tolerated above the sustained rate, for the first seconds and for bursts. */
export const PLAUSIBILITY_BURST_INSERTS = 20;

/**
 * Most inserts an entrant can plausibly have made `sinceStart` after the start (COURSE-06).
 * A batch that would take the entrant's total above it is refused whole. Counting from the start,
 * not per batch, keeps a client that flushes after a network stall within the limit.
 */
export function maxPlausibleInserts(sinceStart: Duration): number {
  return Math.floor((MAX_PLAUSIBLE_INSERTS_PER_SECOND * sinceStart) / 1_000) + PLAUSIBILITY_BURST_INSERTS;
}
