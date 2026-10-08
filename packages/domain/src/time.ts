/**
 * Time in the engine (COURSE-06): the server's clock is the only authority.
 *
 * - An {@link Instant} is a point in time: integer milliseconds since the Unix epoch, read from
 *   the clock the server injects. The engine never reads a clock itself.
 * - A {@link Duration} is an elapsed span: integer milliseconds, never negative.
 *
 * Client timestamps never reach the engine; a keystroke batch is timed by the server's `now`
 * when it is applied. Every value is finite and bounded, so no computation can produce NaN,
 * Infinity or an overflowing sum.
 */
export type Instant = number & { readonly __brand: "Instant" };
export type Duration = number & { readonly __brand: "Duration" };

/** Latest instant the engine accepts: 2100-01-01T00:00:00Z. */
export const MAX_INSTANT = 4_102_444_800_000;

/** Longest span the engine handles. A race lasts minutes; 24 hours bounds every computation. */
export const MAX_DURATION_MS = 86_400_000;

/** Checks a server clock reading. Throws on a programming error, never on client input. */
export function asInstant(milliseconds: number): Instant {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_INSTANT) {
    throw new RangeError(`Invalid instant ${milliseconds}: expected an integer in [0, ${MAX_INSTANT}]`);
  }
  return milliseconds as Instant;
}

/** Checks a span. Throws on a programming error, never on client input. */
export function asDuration(milliseconds: number): Duration {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_DURATION_MS) {
    throw new RangeError(`Invalid duration ${milliseconds}: expected an integer in [0, ${MAX_DURATION_MS}]`);
  }
  return milliseconds as Duration;
}

/** Time elapsed from `from` to `to`; `to` must not be earlier than `from`. */
export function elapsedBetween(from: Instant, to: Instant): Duration {
  return asDuration(to - from);
}

/** The instant `span` after `from`. */
export function addDuration(from: Instant, span: Duration): Instant {
  return asInstant(from + span);
}
