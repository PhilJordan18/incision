import { singleGrapheme } from "../text/graphemes";
import type { EntrantState, ErrorMode, InputEvent } from "./types";

/**
 * The typing rules, shared by `applyKeystrokes` (authoritative) and `predictTyping` (visual), so the
 * prediction is never a second implementation. Internal: the package index does not export it.
 */

/** An entrant has finished once the typed text reaches the target's length (errors included in free mode). */
export function isFinished(target: readonly string[], typed: readonly string[]): boolean {
  return typed.length === target.length;
}

/** The engine's one comparison: the grapheme typed at `position` is the expected one. */
export function isExpected(target: readonly string[], position: number, grapheme: string): boolean {
  return grapheme === target[position];
}

/** Every event checked before any is applied: one invalid event refuses the whole batch. */
export function normalizedEvents(events: readonly InputEvent[]): readonly InputEvent[] | undefined {
  const normalized: InputEvent[] = [];
  for (const event of events) {
    if (event.type === "deleteBackward") {
      normalized.push(event);
      continue;
    }
    // The type promises a string; the check keeps a malformed payload a refusal, not a throw.
    const grapheme = event.type === "insert" && typeof event.grapheme === "string" ? singleGrapheme(event.grapheme) : undefined;
    if (grapheme === undefined) {
      return undefined;
    }
    normalized.push({ type: "insert", grapheme });
  }
  return normalized;
}

export type Typing = Pick<EntrantState, "typed" | "pendingError" | "counters" | "missedKeys">;

/**
 * Types the events in order (D-09, CONF-08). Free mode inserts every grapheme, compared position
 * by position; mandatory correction inserts only the expected one. Events after the finishing
 * insert are discarded.
 */
export function typeEvents(entrant: Typing & Pick<EntrantState, "target">, events: readonly InputEvent[], errorMode: ErrorMode): Typing {
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
    const correct = isExpected(target, typed.length, event.grapheme);
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
