import { asDuration } from "../time";
import { CHARACTERS_PER_WORD, type ComputeMeasures, type TypingCounters } from "./types";

/** (inserts ÷ 5) ÷ minutes is inserts × 12 000 ÷ milliseconds: one product, then one division. */
const WPM_PER_INSERT_MS = 60_000 / CHARACTERS_PER_WORD;

/**
 * Appendix A, exact and never capped (F-02.1). For counters the engine accepted every product
 * stays below 2⁵³ (`MAX_ENTRANT_INSERTS` × 12 000), so integer inputs give the exact quotient.
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
    netWpm: (correctInserts * WPM_PER_INSERT_MS) / milliseconds,
    rawWpm: (totalInserts * WPM_PER_INSERT_MS) / milliseconds,
    accuracy,
  };
};

function checkedCounters(counters: TypingCounters): TypingCounters {
  const { correctInserts, totalInserts } = counters;
  if (
    !Number.isSafeInteger(correctInserts) ||
    !Number.isSafeInteger(totalInserts) ||
    correctInserts < 0 ||
    correctInserts > totalInserts
  ) {
    throw new RangeError(
      `Invalid counters ${correctInserts}/${totalInserts}: expected integers with 0 <= correct <= total`,
    );
  }
  return counters;
}
