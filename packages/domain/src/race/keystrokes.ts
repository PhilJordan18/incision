import type { RaceId } from "../ids";
import { singleGrapheme } from "../text/graphemes";
import { measuredElapsed } from "./elapsed";
import { MAX_BATCH_EVENTS, maxPlausibleInserts } from "./limits";
import type {
  ApplyKeystrokes,
  EntrantKeystrokeRefusal,
  EntrantKeystrokeResult,
  EntrantSnapshot,
  EntrantState,
  ErrorMode,
  InputEvent,
  KeystrokeBatch,
  ResyncReason,
  ToEntrantSnapshot,
} from "./types";

/**
 * Applies one batch of a known entrant, whole or not at all (F-04.4). The checks run in the
 * contract's order; any reply other than `applied` returns the entrant object untouched, so a
 * refusal never consumes a `seq`.
 */
export const applyKeystrokes: ApplyKeystrokes = (entrant, batch, context) => {
  const { seq } = batch;
  if (!hasValidShape(batch)) {
    return refused(entrant, batch, "INVALID_INPUT");
  }
  if (seq <= entrant.ackSeq) {
    return { entrant, result: { outcome: "duplicate", seq, ackSeq: entrant.ackSeq } };
  }
  if (context.phase !== "racing") {
    return refused(entrant, batch, "NOT_RACING");
  }
  if (entrant.status !== "racing") {
    return refused(entrant, batch, "ENTRANT_TERMINAL");
  }
  if (seq !== entrant.ackSeq + 1) {
    return resync(entrant, batch, "OUT_OF_ORDER");
  }
  if (batch.textVersion !== entrant.textVersion) {
    return resync(entrant, batch, "TEXT_VERSION_CHANGED");
  }
  if (batch.events.length > MAX_BATCH_EVENTS) {
    return refused(entrant, batch, "BATCH_TOO_LARGE");
  }
  const events = normalizedEvents(batch.events);
  if (events === undefined) {
    return refused(entrant, batch, "INVALID_INPUT");
  }
  const typed = typeEvents(entrant, events, context.errorMode);
  // COURSE-06: the entrant's applied inserts, counted from the start, must stay plausible.
  if (typed.counters.totalInserts > maxPlausibleInserts(measuredElapsed(context.startsAt, context.now))) {
    return refused(entrant, batch, "IMPLAUSIBLE");
  }
  const finished = typed.typed.length === entrant.target.length;
  const next: EntrantState = {
    ...entrant,
    ...typed,
    ackSeq: seq,
    ...(finished ? { status: "finished", endedAt: context.now } : {}),
  };
  return { entrant: next, result: { outcome: "applied", seq, ackSeq: seq, textVersion: entrant.textVersion } };
};

/** The authoritative snapshot of one entrant, or undefined for an entrant the race does not know. */
export const toEntrantSnapshot: ToEntrantSnapshot = (state, entrantId) => {
  const entrant = state.entrants.find((candidate) => candidate.entrantId === entrantId);
  return entrant === undefined ? undefined : snapshotOf(entrant, state.raceId);
};

function snapshotOf(entrant: EntrantState, raceId: RaceId): EntrantSnapshot {
  return {
    raceId,
    entrantId: entrant.entrantId,
    textVersion: entrant.textVersion,
    target: entrant.target,
    typed: entrant.typed,
    pendingError: entrant.pendingError,
    ackSeq: entrant.ackSeq,
    status: entrant.status,
    counters: entrant.counters,
  };
}

function refused(entrant: EntrantState, batch: KeystrokeBatch, reason: EntrantKeystrokeRefusal): EntrantKeystrokeResult {
  return { entrant, result: { outcome: "refused", seq: batch.seq, reason, snapshot: snapshotOf(entrant, batch.raceId) } };
}

function resync(entrant: EntrantState, batch: KeystrokeBatch, reason: ResyncReason): EntrantKeystrokeResult {
  return { entrant, result: { outcome: "resync", seq: batch.seq, reason, snapshot: snapshotOf(entrant, batch.raceId) } };
}

function hasValidShape(batch: KeystrokeBatch): boolean {
  return (
    Number.isSafeInteger(batch.seq) &&
    batch.seq >= 1 &&
    Number.isSafeInteger(batch.textVersion) &&
    batch.textVersion >= 0 &&
    batch.events.length >= 1
  );
}

/** Every event checked before any is applied: one invalid event refuses the whole batch. */
function normalizedEvents(events: readonly InputEvent[]): readonly InputEvent[] | undefined {
  const normalized: InputEvent[] = [];
  for (const event of events) {
    if (event.type === "deleteBackward") {
      normalized.push(event);
      continue;
    }
    const grapheme = event.type === "insert" ? singleGrapheme(event.grapheme) : undefined;
    if (grapheme === undefined) {
      return undefined;
    }
    normalized.push({ type: "insert", grapheme });
  }
  return normalized;
}

type Typing = Pick<EntrantState, "typed" | "pendingError" | "counters" | "missedKeys">;

/**
 * Types the events in order (D-09, CONF-08). Free mode inserts every grapheme, compared position
 * by position; mandatory correction inserts only the expected one. Events after the finishing
 * insert are discarded.
 */
function typeEvents(entrant: EntrantState, events: readonly InputEvent[], errorMode: ErrorMode): Typing {
  const { target } = entrant;
  const typed = [...entrant.typed];
  const missedKeys: Record<string, number> = { ...entrant.missedKeys };
  let { pendingError } = entrant;
  let { correctInserts, totalInserts } = entrant.counters;
  for (const event of events) {
    const expected = target[typed.length];
    if (expected === undefined) {
      break;
    }
    if (event.type === "deleteBackward") {
      if (pendingError) {
        pendingError = false;
      } else {
        typed.pop();
      }
      continue;
    }
    totalInserts += 1;
    const correct = event.grapheme === expected;
    if (correct) {
      correctInserts += 1;
    } else {
      missedKeys[expected] = (missedKeys[expected] ?? 0) + 1;
    }
    if (correct || errorMode === "free") {
      typed.push(event.grapheme);
      pendingError = false;
    } else {
      pendingError = true;
    }
  }
  return { typed, pendingError, counters: { correctInserts, totalInserts }, missedKeys };
}
