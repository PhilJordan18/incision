import { computeMeasures } from "../measures/compute";
import { asInstant } from "../time";
import { measuredElapsed } from "./elapsed";
import type { PublicEntrantProgress, ToRaceBroadcast, ToRaceReveal } from "./types";

/**
 * The public view of the race (COURSE-05), computed at the later of `now` and the race clock. Each
 * entrant's net WPM is exact over `measuredElapsed`: 0 during the countdown, frozen at the
 * entrant's end, and at the race's end for an entrant of an interrupted race.
 */
export const toRaceBroadcast: ToRaceBroadcast = (state, now) => {
  const checked = asInstant(now);
  const at = checked < state.clock ? state.clock : checked;
  const entrants = state.entrants.map((entrant): PublicEntrantProgress => {
    const elapsed = measuredElapsed(state.startsAt, at, entrant.endedAt ?? state.endedAt);
    return {
      entrantId: entrant.entrantId,
      kind: entrant.kind,
      status: entrant.status,
      position: entrant.typed.length,
      length: entrant.target.length,
      netWpm: computeMeasures(entrant.counters, elapsed).netWpm,
      ...(entrant.endedAt === undefined ? {} : { endedAt: entrant.endedAt }),
    };
  });
  return {
    raceId: state.raceId,
    revision: state.revision,
    phase: state.phase,
    startsAt: state.startsAt,
    ...(state.endedAt === undefined ? {} : { endedAt: state.endedAt }),
    timeLimit: state.timeLimit,
    entrants,
  };
};

/** The text and the settings, sent when the countdown begins (COURSE-03) and on a reconnection. */
export const toRaceReveal: ToRaceReveal = (state) => ({
  raceId: state.raceId,
  text: state.text,
  errorMode: state.errorMode,
  countdownAt: state.countdownAt,
  startsAt: state.startsAt,
  timeLimit: state.timeLimit,
});
