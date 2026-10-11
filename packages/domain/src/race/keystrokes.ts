import type { RaceId } from "../ids";
import { measuredElapsed } from "./elapsed";
import { MAX_BATCH_EVENTS, maxPlausibleInserts } from "./limits";
import { isFinished, normalizedEvents, typeEvents } from "./typing-fold";
import type {
  ApplyKeystrokes,
  EntrantKeystrokeRefusal,
  EntrantKeystrokeResult,
  EntrantSnapshot,
  EntrantState,
  KeystrokeBatch,
  ResyncReason,
  ToEntrantSnapshot,
} from "./types";

/**
 * Applies one batch of a known entrant, whole or not at all (F-04.4). The checks run in the
 * contract's order; any reply other than `applied` returns the entrant object untouched, so a
 * refusal never consumes a `seq`.
 *
 * Precondition: the batch belongs to this race and this entrant. `reduceRace` answers
 * `WRONG_RACE` and `UNKNOWN_ENTRANT` before calling it, so snapshots take `raceId` from the batch.
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
  const typing = typeEvents(entrant, events, context.errorMode);
  // COURSE-06: the entrant's applied inserts, counted from the start, must stay plausible.
  if (typing.counters.totalInserts > maxPlausibleInserts(measuredElapsed(context.startsAt, context.now))) {
    return refused(entrant, batch, "IMPLAUSIBLE");
  }
  const finished = isFinished(entrant.target, typing.typed);
  const next: EntrantState = {
    ...entrant,
    ...typing,
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
