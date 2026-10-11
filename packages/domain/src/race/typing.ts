import type { PredictTyping, TypedMark } from "./types";
import { isExpected, normalizedEvents, typeEvents } from "./typing-fold";

/**
 * Immediate feedback for the typing zone (COURSE-04): the engine's own fold applied to the pending
 * events, so the interface never re-implements a rule. Visual only; any server reply replaces it.
 */
export const predictTyping: PredictTyping = (start, events, errorMode) => {
  const normalized = normalizedEvents(events);
  if (normalized === undefined) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const { typed, pendingError } = typeEvents({ ...start, counters: { correctInserts: 0, totalInserts: 0 }, missedKeys: {} }, normalized, errorMode);
  return { ok: true, typed, marks: typedMarks(start.target, typed), pendingError, finished: typed.length === start.target.length };
};

/** One mark per typed grapheme, for a prediction or a snapshot as received. */
export function typedMarks(target: readonly string[], typed: readonly string[]): readonly TypedMark[] {
  return typed.map((grapheme, position) => (isExpected(target, position, grapheme) ? "correct" : "wrong"));
}
