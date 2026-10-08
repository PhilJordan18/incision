import type { Duration } from "../time";

/** Appendix A divides characters by five to count words. */
export const CHARACTERS_PER_WORD = 5;

/**
 * Inserts counted as D-09 defines them: every inserted grapheme, spaces included. A deletion
 * never counts, and a wrong insert stays counted even once it is corrected. Errors are
 * `totalInserts - correctInserts`.
 */
export type TypingCounters = {
  readonly correctInserts: number;
  readonly totalInserts: number;
};

/**
 * Appendix A, from the server's elapsed time:
 * - `netWpm` = (correct inserts ÷ 5) ÷ minutes;
 * - `rawWpm` = (all inserts ÷ 5) ÷ minutes;
 * - `accuracy` = correct inserts ÷ all inserts × 100, in [0, 100].
 *
 * Unrounded and always finite. A zero elapsed time gives 0 WPM; zero inserts give 0 everywhere,
 * never NaN or Infinity (D-09). Rounding for display belongs to the interface.
 */
export type Measures = {
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
};

/** Contract of F-02.1: implemented in `packages/domain`, never in the application. */
export type ComputeMeasures = (counters: TypingCounters, elapsed: Duration) => Measures;
