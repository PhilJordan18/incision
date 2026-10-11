import { computeMeasures } from "../measures/compute";
import type { Measures } from "../measures/types";
import { asInstant, type Instant } from "../time";
import { measuredElapsed } from "./elapsed";
import type { EntrantState, PublicEntrantProgress, RaceState, ToEntrantMeasures, ToRaceBroadcast, ToRaceReveal } from "./types";

/**
 * The public view of the race (COURSE-05), computed at the later of `now` and the race clock. Each
 * entrant's net WPM is exact over `measuredElapsed`: 0 during the countdown, frozen at the
 * entrant's end, and at the race's end for an entrant of an interrupted race.
 */
export const toRaceBroadcast: ToRaceBroadcast = (state, now) => {
  const at = viewInstant(state, now);
  const entrants = state.entrants.map(
    (entrant): PublicEntrantProgress => ({
      entrantId: entrant.entrantId,
      kind: entrant.kind,
      status: entrant.status,
      position: entrant.typed.length,
      length: entrant.target.length,
      netWpm: liveMeasures(state, entrant, at).netWpm,
      ...(entrant.endedAt === undefined ? {} : { endedAt: entrant.endedAt }),
      inactive: entrant.inactive,
    }),
  );
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

/**
 * One entrant's live Appendix A measures (COURSE-04), timed exactly as `toRaceBroadcast` times its
 * net WPM, at the later of `now` and the race clock; undefined for an entrant the race does not know.
 * The official results stay `RaceEnd`'s.
 */
export const toEntrantMeasures: ToEntrantMeasures = (state, entrantId, now) => {
  const entrant = state.entrants.find((candidate) => candidate.entrantId === entrantId);
  return entrant === undefined ? undefined : liveMeasures(state, entrant, viewInstant(state, now));
};

/** The instant every view uses: the later of `now` and the race clock. */
function viewInstant(state: RaceState, now: Instant): Instant {
  const checked = asInstant(now);
  return checked < state.clock ? state.clock : checked;
}

/** Measures over `measuredElapsed`: 0 during the countdown, frozen at the entrant's end, or at the race's end. */
function liveMeasures(state: RaceState, entrant: EntrantState, at: Instant): Measures {
  return computeMeasures(entrant.counters, measuredElapsed(state.startsAt, at, entrant.endedAt ?? state.endedAt));
}

/** The text and the settings, sent when the countdown begins (COURSE-03) and on a reconnection. */
export const toRaceReveal: ToRaceReveal = (state) => ({
  raceId: state.raceId,
  text: state.text,
  errorMode: state.errorMode,
  countdownAt: state.countdownAt,
  startsAt: state.startsAt,
  timeLimit: state.timeLimit,
});
