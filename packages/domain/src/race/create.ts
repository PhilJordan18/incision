import { asEntrantId, asRaceId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asInstant } from "../time";
import { COUNTDOWN_MS, MAX_TEXT_GRAPHEMES, TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "./limits";
import { ENTRANT_KINDS, startRefusal } from "./start";
import { ERROR_MODES, type CreateRace, type CreateRaceInput, type CreateRaceRefusal, type EntrantState } from "./types";

/**
 * Why `createRace` would refuse these parameters, or undefined when it would accept them
 * (F-04.1). The checks run in this order: the start rule (COURSE-02), a duplicate entrant, an
 * empty text, a text longer than `MAX_TEXT_GRAPHEMES` NFC graphemes, a time limit that is neither
 * null nor an integer from `TIME_LIMIT_MIN_MS` to `TIME_LIMIT_MAX_MS` inclusive.
 *
 * It reads only the participants, the text and the time limit, so the server can check them
 * before the start. Passing it guarantees valid parameters, not that the host may start or that
 * the room is still available: under the room lock the start rechecks the host, the phase and the
 * participants, and gives `createRace` the text, configuration and entrants frozen for that
 * transaction.
 */
export function createRaceRefusal(input: Pick<CreateRaceInput, "participants" | "text" | "timeLimit">): CreateRaceRefusal | undefined {
  const start = startRefusal(input.participants);
  if (start !== undefined) {
    return start;
  }
  const ids = new Set(input.participants.map((participant) => participant.entrantId));
  if (ids.size !== input.participants.length) {
    return "DUPLICATE_ENTRANT";
  }
  const length = toGraphemes(input.text).length;
  if (length === 0) {
    return "EMPTY_TEXT";
  }
  if (length > MAX_TEXT_GRAPHEMES) {
    return "TEXT_TOO_LONG";
  }
  const { timeLimit } = input;
  if (timeLimit !== null && !(Number.isSafeInteger(timeLimit) && timeLimit >= TIME_LIMIT_MIN_MS && timeLimit <= TIME_LIMIT_MAX_MS)) {
    return "INVALID_TIME_LIMIT";
  }
  return undefined;
}

/**
 * A race on a fixed text, from the reveal (F-04.1). It applies `createRaceRefusal` first, so the
 * two never disagree. Values the server alone produces (the race and entrant ids, the kinds, the
 * error mode, its clock) are checked as programming errors and throw a `RangeError`, as does a
 * `now` whose start or time-limit deadline would pass `MAX_INSTANT`.
 */
export const createRace: CreateRace = (input) => {
  const reason = createRaceRefusal(input);
  if (reason !== undefined) {
    return { ok: false, reason };
  }
  const raceId = asRaceId(input.raceId);
  if (!ERROR_MODES.includes(input.errorMode)) {
    throw new RangeError(`Invalid error mode ${String(input.errorMode)}`);
  }
  const now = asInstant(input.now);
  const startsAt = asInstant(now + COUNTDOWN_MS);
  // Every deadline the reducer derives stays a valid instant.
  asInstant(startsAt + (input.timeLimit ?? 0));
  const text = toGraphemes(input.text);
  const entrants = input.participants.map(({ entrantId, kind }): EntrantState => {
    if (!ENTRANT_KINDS.includes(kind)) {
      throw new RangeError(`Invalid kind ${String(kind)} for ${entrantId}`);
    }
    return {
      entrantId: asEntrantId(entrantId),
      kind,
      target: text,
      textVersion: 0,
      typed: [],
      pendingError: false,
      counters: { correctInserts: 0, totalInserts: 0 },
      missedKeys: {},
      ackSeq: 0,
      status: "racing",
    };
  });
  return {
    ok: true,
    race: {
      raceId,
      revision: 0,
      phase: "countdown",
      errorMode: input.errorMode,
      timeLimit: input.timeLimit,
      countdownAt: now,
      startsAt,
      clock: now,
      text,
      entrants,
    },
  };
};
