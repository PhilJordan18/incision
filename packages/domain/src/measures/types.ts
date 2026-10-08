import type { Duration } from "../time";

/** Appendix A divides characters by five to count words. */
export const CHARACTERS_PER_WORD = 5;

/**
 * Measure bound: the highest WPM `computeMeasures` ever returns, which every consumer relies on.
 *
 * 600 is twice the plausible sustained rate (300 WPM, `MAX_PLAUSIBLE_INSERTS_PER_SECOND`). Within
 * the plausibility limit a measured WPM is at most 300 + 240 ÷ t, with t the elapsed seconds:
 * - a value between 300 and 600 can only come from the burst margin in the first seconds;
 * - a value above 600 needs t < 0.8 s, so it is an artefact of a near-zero elapsed time, never a
 *   performance (20 inserts 10 ms after the start, then an abandon, would give 24 000).
 *
 * Appendix A is applied exactly, then capped at this bound, and `Measures.capped` says so. The bound
 * comes from the plausibility rule, not from any storage constraint.
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
 * - `netWpm` = (correct inserts ÷ 5) ÷ minutes, at most `MAX_WPM` (see `capped`);
 * - `rawWpm` = (all inserts ÷ 5) ÷ minutes, at most `MAX_WPM` (see `capped`);
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
  /**
   * True when net or raw WPM was capped at `MAX_WPM`: the value is then no longer Appendix A, and
   * the interface marks it instead of presenting it as a speed. It happens only below 0.8 s of
   * measured time within the plausibility limit. Stored and shown as is, with this flag.
   */
  readonly capped: boolean;
};

/** Contract of F-02.1: implemented in `packages/domain`, never in the application. */
export type ComputeMeasures = (counters: TypingCounters, elapsed: Duration) => Measures;
