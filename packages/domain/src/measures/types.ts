import type { Duration } from "../time";

/** Appendix A divides characters by five to count words. */
export const CHARACTERS_PER_WORD = 5;

/**
 * Inserts counted as D-09 defines them: every inserted grapheme, spaces included. A deletion
 * never counts, and a wrong insert stays counted even once it is corrected. Errors are
 * `totalInserts - correctInserts`. Both are integers with `0 <= correctInserts <= totalInserts`;
 * anything else is a programming error and throws.
 */
export type TypingCounters = {
  readonly correctInserts: number;
  readonly totalInserts: number;
};

/**
 * Appendix A, from the measured elapsed time (`measuredElapsed`):
 * - `netWpm` = (correct inserts ÷ 5) ÷ minutes;
 * - `rawWpm` = (all inserts ÷ 5) ÷ minutes;
 * - `accuracy` = correct inserts ÷ all inserts × 100, in [0, 100].
 *
 * Exact and unrounded, never capped: these are the official values, stored as computed, with the
 * counters and the elapsed time they come from. A zero elapsed time gives 0 WPM; zero inserts give
 * 0 everywhere, never NaN or Infinity (D-09). For counters the engine accepted, a value never
 * exceeds `MAX_COMPUTABLE_WPM`; a high value at the very start, from the burst margin, stays exact.
 * Rounding and any display limit belong to the interface, explicitly flagged there, and never
 * replace a stored value. Comparisons of stored values allow for floating-point rounding.
 */
export type Measures = {
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
};

/** Contract of F-02.1: implemented in `packages/domain`, never in the application. */
export type ComputeMeasures = (counters: TypingCounters, elapsed: Duration) => Measures;
