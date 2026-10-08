import type { ContractExample } from "../contract-example";
import { asDuration, type Duration } from "../time";
import type { Measures, TypingCounters } from "./types";

/** Executed by F-02.1 against `computeMeasures`. */
export const MEASURES_EXAMPLES: readonly ContractExample<{ readonly counters: TypingCounters; readonly elapsed: Duration }, Measures>[] = [
  {
    name: "250 correct inserts in one minute give 50 WPM",
    input: { counters: { correctInserts: 250, totalInserts: 250 }, elapsed: asDuration(60_000) },
    expected: { netWpm: 50, rawWpm: 50, accuracy: 100 },
  },
  {
    name: "errors lower the net speed and the accuracy, not the raw speed",
    input: { counters: { correctInserts: 270, totalInserts: 300 }, elapsed: asDuration(90_000) },
    expected: { netWpm: 36, rawWpm: 40, accuracy: 90 },
  },
  {
    name: "zero inserts give zero everywhere, never NaN (D-09)",
    input: { counters: { correctInserts: 0, totalInserts: 0 }, elapsed: asDuration(60_000) },
    expected: { netWpm: 0, rawWpm: 0, accuracy: 0 },
  },
  {
    name: "zero elapsed time gives 0 WPM, never Infinity; accuracy stays defined (D-09)",
    input: { counters: { correctInserts: 10, totalInserts: 10 }, elapsed: asDuration(0) },
    expected: { netWpm: 0, rawWpm: 0, accuracy: 100 },
  },
];
