import { computeMeasures } from "../measures/compute";
import { asInstant, MAX_INSTANT, type Instant } from "../time";
import { measuredElapsed } from "./elapsed";
import { applyKeystrokes } from "./keystrokes";
import { INACTIVITY_ABANDON_MS, INACTIVITY_WARNING_MS, RESUME_GRACE_MS } from "./limits";
import { rankEntrants } from "./ranking";
import type {
  AbandonReason,
  EntrantResult,
  EntrantState,
  KeystrokeBatch,
  KeystrokeResult,
  PresenceIgnored,
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

type Reply = { readonly keystrokes?: KeystrokeResult; readonly ignored?: PresenceIgnored };
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
    case "connectionLost":
      return presence(state, event.entrantId, (entrant) =>
        entrant.disconnectedAt === undefined ? { ...entrant, disconnectedAt: now } : "ALREADY_DISCONNECTED",
      );
    case "connectionResumed":
      // Not activity (D-17): only a batch or « Je suis là » resets the inactivity.
      return presence(state, event.entrantId, (entrant) => (entrant.disconnectedAt === undefined ? "NOT_DISCONNECTED" : connected(entrant)));
    case "present":
      return presence(state, event.entrantId, (entrant) => active(entrant, now));
  }
}

/**
 * A presence event (D-06, D-17) for one racing human, ignored in the documented order: the
 * entrant, the race, the entrant's status, a bot, then `change`'s own reason.
 */
function presence(state: RaceState, entrantId: EntrantState["entrantId"], change: (entrant: EntrantState) => EntrantState | PresenceIgnored): Handled {
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
  if (entrant.kind === "bot") {
    return { state, reply: { ignored: "BOT_ENTRANT" } };
  }
  const next = change(entrant);
  return typeof next === "string" ? { state, reply: { ignored: next } } : { state: withEntrant(state, index, next), reply: {} };
}

/** Activity (D-17): never earlier than the start, since nobody types during the countdown. */
function active(entrant: EntrantState, now: Instant): EntrantState {
  return { ...entrant, lastActivityAt: now > entrant.lastActivityAt ? now : entrant.lastActivityAt, inactive: false };
}

/** The same entrant without a running grace. */
function connected(entrant: EntrantState): EntrantState {
  const { disconnectedAt, ...rest } = entrant;
  return disconnectedAt === undefined ? entrant : rest;
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
  if (result.outcome !== "applied") {
    // A duplicate, a refusal or a resync is not activity (D-17): only a newly applied batch is.
    return { state, reply: { keystrokes: result } };
  }
  return { state: withEntrant(state, index, active(next, now)), reply: { keystrokes: result } };
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
 * The transitions due at `now`, in this order:
 * 1. the start;
 * 2. while racing, each human's own abandon (inactivity or disconnection, D-06, D-17), earliest
 *    first, as long as it comes before the time limit; the race ends as soon as everyone is
 *    terminal, at the latest of `startsAt` and the last `endedAt`, so a later deadline, the time
 *    limit included, never turns those abandons into time-outs;
 * 3. the time limit, inclusive, which times out whoever is still racing at its deadline and wins a
 *    tie with any other deadline (D-06);
 * 4. the inactive marker of those still racing (INACTIVITY_WARNING_MS, inclusive).
 */
function applyDue(state: RaceState, now: Instant): RaceState {
  const started = state.phase === "countdown" && now >= state.startsAt ? { ...state, phase: "racing" as const } : state;
  if (started.phase !== "racing") {
    return started;
  }
  const deadline = timeLimitDeadline(started);
  let race: RaceState = started;
  for (const expiry of dueExpiries(started, now)) {
    // Each entrant's deadline is independent: only those before the time limit apply (D-06 tie).
    if (deadline !== undefined && expiry.at >= deadline) {
      continue;
    }
    const entrant = race.entrants[expiry.index];
    if (entrant !== undefined) {
      // Due means strictly before `now`, so the deadline is a valid instant.
      race = withEntrant(race, expiry.index, { ...entrant, status: "abandoned", abandonReason: expiry.reason, endedAt: asInstant(expiry.at) });
    }
  }
  const lastEnd = allTerminalAt(race);
  if (lastEnd !== undefined) {
    return { ...race, phase: "ended", endedAt: lastEnd };
  }
  if (deadline !== undefined && now >= deadline) {
    const entrants = race.entrants.map((entrant): EntrantState => (entrant.status === "racing" ? { ...entrant, status: "timedOut", endedAt: deadline } : entrant));
    return { ...race, phase: "ended", endedAt: deadline, entrants };
  }
  return { ...race, entrants: race.entrants.map((entrant) => (shownInactive(entrant, now) ? { ...entrant, inactive: true } : entrant)) };
}

type Expiry = { readonly index: number; readonly at: number; readonly reason: AbandonReason };

/**
 * The abandons due at `now` (strictly after their deadline, so a reaction at the deadline counts).
 * An entrant's earlier deadline wins; at the same instant the reason is `disconnection`. Bots have
 * none (D-17). Their order does not matter: each is independent, and the race's end is the latest.
 */
function dueExpiries(state: RaceState, now: Instant): readonly Expiry[] {
  const expiries: Expiry[] = [];
  state.entrants.forEach((entrant, index) => {
    if (entrant.status !== "racing" || entrant.kind === "bot") {
      return;
    }
    const grace = graceDeadline(entrant);
    const idle = inactivityDeadline(entrant);
    const expiry: Expiry = grace !== undefined && grace <= idle ? { index, at: grace, reason: "disconnection" } : { index, at: idle, reason: "inactivity" };
    if (now > expiry.at) {
      expiries.push(expiry);
    }
  });
  return expiries;
}

/** The presence deadlines are compared as plain numbers: near MAX_INSTANT they may lie past it. */
function graceDeadline(entrant: EntrantState): number | undefined {
  return entrant.disconnectedAt === undefined ? undefined : entrant.disconnectedAt + RESUME_GRACE_MS;
}

function inactivityDeadline(entrant: EntrantState): number {
  return entrant.lastActivityAt + INACTIVITY_ABANDON_MS;
}

function warningInstant(entrant: EntrantState): number {
  return entrant.lastActivityAt + INACTIVITY_WARNING_MS;
}

function shownInactive(entrant: EntrantState, now: Instant): boolean {
  return entrant.status === "racing" && entrant.kind !== "bot" && !entrant.inactive && now >= warningInstant(entrant);
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

/**
 * The next instant at which a `tick` would change something: the start, the time limit, and each
 * racing human's inactive marker, inactivity abandon and grace expiry (one millisecond after their
 * deadline, since a reaction at the deadline still counts).
 */
function nextDeadline(state: RaceState): Instant | undefined {
  if (state.phase !== "countdown" && state.phase !== "racing") {
    return undefined;
  }
  const candidates: number[] = state.phase === "countdown" ? [state.startsAt] : [];
  const limit = timeLimitDeadline(state);
  if (limit !== undefined) {
    candidates.push(limit);
  }
  for (const entrant of state.entrants) {
    if (entrant.status !== "racing" || entrant.kind === "bot") {
      continue;
    }
    if (!entrant.inactive) {
      candidates.push(warningInstant(entrant));
    }
    candidates.push(inactivityDeadline(entrant) + 1);
    const grace = graceDeadline(entrant);
    if (grace !== undefined) {
      candidates.push(grace + 1);
    }
  }
  // A deadline past MAX_INSTANT never falls due.
  const reachable = candidates.filter((instant) => instant <= MAX_INSTANT);
  return reachable.length === 0 ? undefined : asInstant(Math.min(...reachable));
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
