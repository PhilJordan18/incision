import { computeMeasures } from "../measures/compute";
import { asInstant, type Instant } from "../time";
import { measuredElapsed } from "./elapsed";
import { applyKeystrokes } from "./keystrokes";
import { rankEntrants } from "./ranking";
import type {
  AbandonIgnored,
  EntrantResult,
  EntrantState,
  KeystrokeBatch,
  KeystrokeResult,
  RaceEnd,
  RaceEvent,
  RaceState,
  ReduceRace,
  TerminalStatus,
} from "./types";
import { toRaceBroadcast } from "./views";

/**
 * The race reducer (F-04.1). Pure: the same state and event always give the same output.
 *
 * - **Time.** The event is handled at the later of its `now` and the race `clock`, so time never
 *   runs backwards inside a race.
 * - **Deadlines.** Every transition due at that instant applies before and after the event, so a
 *   late timer never decides a result.
 * - **Revision.** It moves by exactly 1 when the public view (`toRaceBroadcast` at the handled
 *   instant) changed, however many transitions the event triggered. The private state and the
 *   clock can move without it.
 * - **Final races.** An `ended` or `interrupted` race is returned as is, clock included; a batch
 *   still gets its reply after the usual checks (see `KeystrokeResult`): `duplicate` for a retry,
 *   `NOT_RACING` for a new well-formed batch of a known entrant.
 * - **Results.** `ended` comes exactly once, on the transition to `ended`; an interrupted race
 *   has none (D-06).
 */
export const reduceRace: ReduceRace = (state, event) => {
  const at = asInstant(event.now);
  if (isFinal(state)) {
    return { state, changed: false, ...handle(state, event, state.clock).reply };
  }
  const now = at < state.clock ? state.clock : at;
  const handled = handle(applyDue(state, now), event, now);
  const after = applyDue(handled.state, now);
  const changed = !samePublicView(state, after, now);
  const next: RaceState = { ...after, clock: now, revision: changed ? state.revision + 1 : state.revision };
  const deadline = nextDeadline(next);
  return {
    state: next,
    changed,
    ...handled.reply,
    ...(next.phase === "ended" ? { ended: raceEnd(next) } : {}),
    ...(deadline === undefined ? {} : { nextDeadline: deadline }),
  };
};

type Reply = { readonly keystrokes?: KeystrokeResult; readonly ignored?: AbandonIgnored };
type Handled = { readonly state: RaceState; readonly reply: Reply };

function isFinal(state: RaceState): boolean {
  return state.phase === "ended" || state.phase === "interrupted";
}

/** Applies the event to a race whose due transitions are already applied. */
function handle(state: RaceState, event: RaceEvent, now: Instant): Handled {
  switch (event.type) {
    case "tick":
      return { state, reply: {} };
    case "interrupt":
      // A race that just ended keeps its results; only a race still running is interrupted.
      return { state: isFinal(state) ? state : { ...state, phase: "interrupted", endedAt: now }, reply: {} };
    case "abandon":
      return abandon(state, event.entrantId, now);
    case "keystrokes":
      return keystrokes(state, event.batch, now);
  }
}

function keystrokes(state: RaceState, batch: KeystrokeBatch, now: Instant): Handled {
  if (batch.raceId !== state.raceId) {
    return { state, reply: { keystrokes: { outcome: "refused", seq: batch.seq, reason: "WRONG_RACE" } } };
  }
  const index = state.entrants.findIndex((entrant) => entrant.entrantId === batch.entrantId);
  const entrant = state.entrants[index];
  if (entrant === undefined) {
    return { state, reply: { keystrokes: { outcome: "refused", seq: batch.seq, reason: "UNKNOWN_ENTRANT" } } };
  }
  const { entrant: next, result } = applyKeystrokes(entrant, batch, { errorMode: state.errorMode, phase: state.phase, startsAt: state.startsAt, now });
  return { state: next === entrant ? state : withEntrant(state, index, next), reply: { keystrokes: result } };
}

/** A confirmed abandon (COURSE-07), allowed during the countdown and the race. */
function abandon(state: RaceState, entrantId: EntrantState["entrantId"], now: Instant): Handled {
  const index = state.entrants.findIndex((entrant) => entrant.entrantId === entrantId);
  const entrant = state.entrants[index];
  if (entrant === undefined) {
    return { state, reply: { ignored: "UNKNOWN_ENTRANT" } };
  }
  if (isFinal(state)) {
    return { state, reply: { ignored: "RACE_OVER" } };
  }
  if (entrant.status !== "racing") {
    return { state, reply: { ignored: "ENTRANT_TERMINAL" } };
  }
  return { state: withEntrant(state, index, { ...entrant, status: "abandoned", abandonReason: "voluntary", endedAt: now }), reply: {} };
}

function withEntrant(state: RaceState, index: number, entrant: EntrantState): RaceState {
  return { ...state, entrants: state.entrants.map((current, position) => (position === index ? entrant : current)) };
}

/**
 * The transitions due at `now`, in order: the start; then, while racing, the end once everyone is
 * terminal, at the latest of `startsAt` and the last `endedAt`; then the time limit, inclusive,
 * which times out whoever is still racing at its deadline. The time limit wins a tie (D-06): since
 * these transitions apply before every event, no entrant ends at or after the deadline.
 */
function applyDue(state: RaceState, now: Instant): RaceState {
  const started = state.phase === "countdown" && now >= state.startsAt ? { ...state, phase: "racing" as const } : state;
  if (started.phase !== "racing") {
    return started;
  }
  const deadline = timeLimitDeadline(started);
  const lastEnd = allTerminalAt(started);
  if (lastEnd !== undefined) {
    return { ...started, phase: "ended", endedAt: lastEnd };
  }
  if (deadline !== undefined && now >= deadline) {
    const entrants = started.entrants.map((entrant): EntrantState => (entrant.status === "racing" ? { ...entrant, status: "timedOut", endedAt: deadline } : entrant));
    return { ...started, phase: "ended", endedAt: deadline, entrants };
  }
  return started;
}

function timeLimitDeadline(state: RaceState): Instant | undefined {
  return state.timeLimit === null ? undefined : asInstant(state.startsAt + state.timeLimit);
}

/** When the last entrant became terminal, never before the start; undefined while one still races. */
function allTerminalAt(state: RaceState): Instant | undefined {
  let latest = state.startsAt;
  for (const entrant of state.entrants) {
    if (entrant.status === "racing") {
      return undefined;
    }
    if (entrant.endedAt !== undefined && entrant.endedAt > latest) {
      latest = entrant.endedAt;
    }
  }
  return latest;
}

/** The next instant at which a `tick` would change something: the start, then the time limit. */
function nextDeadline(state: RaceState): Instant | undefined {
  if (state.phase === "countdown") {
    return state.startsAt;
  }
  return state.phase === "racing" ? timeLimitDeadline(state) : undefined;
}

/**
 * Whether everyone in the room sees the same race in both states at `at`, revision aside: the
 * broadcast itself is compared, so any public field, including those later cards add, counts.
 */
function samePublicView(before: RaceState, after: RaceState, at: Instant): boolean {
  return equalData({ ...toRaceBroadcast(before, at), revision: 0 }, { ...toRaceBroadcast(after, at), revision: 0 });
}

/** Deep equality of plain data: primitives, arrays and records. */
function equalData(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null || Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length && keys.every((key) => Object.hasOwn(rightRecord, key) && equalData(leftRecord[key], rightRecord[key]));
}

/** The official results (RES-02, COURSE-10), computed once from the ended race. */
function raceEnd(state: RaceState): RaceEnd {
  const endedAt = asInstant(state.endedAt ?? state.clock);
  const rows = state.entrants.map((entrant) => {
    const status = terminalStatus(entrant);
    const elapsed = measuredElapsed(state.startsAt, endedAt, entrant.endedAt);
    return { entrant, status, elapsed, measures: computeMeasures(entrant.counters, elapsed) };
  });
  const byId = new Map(rows.map((row) => [row.entrant.entrantId, row]));
  const ranking = rankEntrants(
    rows.map(({ entrant, status, measures }) => ({
      entrantId: entrant.entrantId,
      status,
      endedAt: entrant.endedAt ?? endedAt,
      position: entrant.typed.length,
      length: entrant.target.length,
      accuracy: measures.accuracy,
    })),
  );
  const results = ranking.map(({ entrantId, rank }): EntrantResult => {
    const row = byId.get(entrantId);
    if (row === undefined) {
      throw new RangeError(`Ranked entrant ${entrantId} is not in the race`);
    }
    const { entrant, status, elapsed, measures } = row;
    return {
      entrantId,
      kind: entrant.kind,
      rank,
      status,
      ...(entrant.abandonReason === undefined ? {} : { abandonReason: entrant.abandonReason }),
      elapsed,
      position: entrant.typed.length,
      length: entrant.target.length,
      counters: entrant.counters,
      errors: entrant.counters.totalInserts - entrant.counters.correctInserts,
      measures,
      missedKeys: entrant.missedKeys,
    };
  });
  return { raceId: state.raceId, endedAt, results };
}

function terminalStatus(entrant: EntrantState): TerminalStatus {
  if (entrant.status === "racing") {
    throw new RangeError(`Entrant ${entrant.entrantId} is still racing in an ended race`);
  }
  return entrant.status;
}
