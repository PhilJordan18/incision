import { asDuration, MAX_DURATION_MS, type Duration, type Instant } from "../time";

/**
 * How long an entrant has raced at `now`, the time every measure uses (Appendix A):
 * - 0 before the start, during the countdown, and for an entrant who abandoned during it;
 * - frozen at `endedAt` once the entrant finished, timed out or abandoned;
 * - capped at `MAX_DURATION_MS`, so a race left open never makes a measure throw.
 */
export function measuredElapsed(startsAt: Instant, now: Instant, endedAt?: Instant): Duration {
  const until = endedAt !== undefined && endedAt < now ? endedAt : now;
  return asDuration(Math.min(Math.max(until - startsAt, 0), MAX_DURATION_MS));
}
