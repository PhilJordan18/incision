import { MAX_ENTRANT_INSERTS } from "../race/limits";
import { asDuration } from "../time";
import { CHARACTERS_PER_WORD, type ComputeMeasures, type TypingCounters } from "./types";

/** Turns inserts per millisecond into WPM: (inserts ÷ 5) ÷ minutes = inserts × 12 000 ÷ ms. */
const INSERT_MS_TO_WPM = 60_000 / CHARACTERS_PER_WORD;

/**
 * Appendix A, exact and never capped (F-02.1). Counters are at most `MAX_ENTRANT_INSERTS`, so every
 * product (inserts × 12 000, correct × 100) is an exact integer below 2⁵³, and each measure is the
 * correctly rounded quotient of exact integers.
 */
export const computeMeasures: ComputeMeasures = (counters, elapsed) => {
  const { correctInserts, totalInserts } = checkedCounters(counters);
  const milliseconds = asDuration(elapsed);
  // D-09: zero inserts give 0 everywhere, zero elapsed time gives 0 WPM, never NaN or Infinity.
  const accuracy = totalInserts === 0 ? 0 : (correctInserts * 100) / totalInserts;
  if (milliseconds === 0) {
    return { netWpm: 0, rawWpm: 0, accuracy };
  }
  return {
    netWpm: (correctInserts * INSERT_MS_TO_WPM) / milliseconds,
    rawWpm: (totalInserts * INSERT_MS_TO_WPM) / milliseconds,
    accuracy,
  };
};

function checkedCounters(counters: TypingCounters): TypingCounters {
  const { correctInserts, totalInserts } = counters;
  if (
    !Number.isSafeInteger(correctInserts) ||
    !Number.isSafeInteger(totalInserts) ||
    correctInserts < 0 ||
    correctInserts > totalInserts ||
    totalInserts > MAX_ENTRANT_INSERTS
  ) {
    throw new RangeError(
      `Invalid counters ${correctInserts}/${totalInserts}: expected integers with 0 <= correct <= total <= ${MAX_ENTRANT_INSERTS}`,
    );
  }
  // + 0 turns a −0 into 0, so no measure is ever −0.
  return { correctInserts: correctInserts + 0, totalInserts: totalInserts + 0 };
}
