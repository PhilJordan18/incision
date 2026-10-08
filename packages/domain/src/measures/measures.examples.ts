import type { ContractExample } from "../contract-example";
import { asDuration, type Duration } from "../time";
import { MAX_WPM, type Measures, type TypingCounters } from "./types";

/** Executed by F-02.1 against `computeMeasures`. */
export const MEASURES_EXAMPLES: readonly ContractExample<{ readonly counters: TypingCounters; readonly elapsed: Duration }, Measures>[] = [
  {
    name: "250 correct inserts in one minute give 50 WPM",
    input: { counters: { correctInserts: 250, totalInserts: 250 }, elapsed: asDuration(60_000) },
    expected: { netWpm: 50, rawWpm: 50, accuracy: 100, capped: false },
  },
  {
    name: "errors lower the net speed and the accuracy, not the raw speed",
    input: { counters: { correctInserts: 270, totalInserts: 300 }, elapsed: asDuration(90_000) },
    expected: { netWpm: 36, rawWpm: 40, accuracy: 90, capped: false },
  },
  {
    name: "zero inserts give zero everywhere, never NaN (D-09)",
    input: { counters: { correctInserts: 0, totalInserts: 0 }, elapsed: asDuration(60_000) },
    expected: { netWpm: 0, rawWpm: 0, accuracy: 0, capped: false },
  },
  {
    name: "zero elapsed time gives 0 WPM, never Infinity; accuracy stays defined (D-09)",
    input: { counters: { correctInserts: 10, totalInserts: 10 }, elapsed: asDuration(0) },
    expected: { netWpm: 0, rawWpm: 0, accuracy: 100, capped: false },
  },
  {
    name: "an implausible burst just after the start is capped at MAX_WPM, never 24 000",
    input: { counters: { correctInserts: 20, totalInserts: 20 }, elapsed: asDuration(10) },
    expected: { netWpm: MAX_WPM, rawWpm: MAX_WPM, accuracy: 100, capped: true },
  },
  {
    name: "an exact Appendix A value below the cap is not touched",
    input: { counters: { correctInserts: 2_500, totalInserts: 2_500 }, elapsed: asDuration(60_000) },
    expected: { netWpm: 500, rawWpm: 500, accuracy: 100, capped: false },
  },
  {
    name: "exactly MAX_WPM is Appendix A, not capped: 50 inserts in one second",
    input: { counters: { correctInserts: 50, totalInserts: 50 }, elapsed: asDuration(1_000) },
    expected: { netWpm: 600, rawWpm: 600, accuracy: 100, capped: false },
  },
  {
    name: "just above MAX_WPM is capped and flagged: 51 inserts in one second",
    input: { counters: { correctInserts: 51, totalInserts: 51 }, elapsed: asDuration(1_000) },
    expected: { netWpm: MAX_WPM, rawWpm: MAX_WPM, accuracy: 100, capped: true },
  },
];
