import type { Duration } from "../time";

/** Appendix A divides characters by five to count words. */
export const CHARACTERS_PER_WORD = 5;

/**
 * Highest WPM the engine ever returns. Appendix A is applied exactly, then capped: only an
 * implausible burst in the first instants of a race (20 inserts 10 ms after the start, then an
 * abandon, would give 24 000) reaches it. Stored WPM columns are sized from this constant.
 */
export const MAX_WPM = 600;

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
 * - `netWpm` = (correct inserts ÷ 5) ÷ minutes, at most `MAX_WPM`;
 * - `rawWpm` = (all inserts ÷ 5) ÷ minutes, at most `MAX_WPM`;
 * - `accuracy` = correct inserts ÷ all inserts × 100, in [0, 100].
 *
 * Unrounded and always finite. A zero elapsed time gives 0 WPM; zero inserts give 0 everywhere,
 * never NaN or Infinity (D-09). Rounding for display belongs to the interface; comparisons of
 * stored values allow for floating-point rounding.
 */
export type Measures = {
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
};

/** Contract of F-02.1: implemented in `packages/domain`, never in the application. */
export type ComputeMeasures = (counters: TypingCounters, elapsed: Duration) => Measures;
