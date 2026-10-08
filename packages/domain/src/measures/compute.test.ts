import { describe, expect, it } from "vitest";
import { MAX_COMPUTABLE_WPM, MAX_ENTRANT_INSERTS, maxPlausibleInserts } from "../race/limits";
import { asDuration, MAX_DURATION_MS, type Duration } from "../time";
import { computeMeasures } from "./compute";
import { MEASURES_EXAMPLES } from "./measures.examples";
import type { Measures } from "./types";

/** Equal up to floating-point rounding, relative to the size of the value. */
function expectMeasures(actual: Measures, expected: Measures): void {
  for (const key of ["netWpm", "rawWpm", "accuracy"] as const) {
    expect(Math.abs(actual[key] - expected[key])).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected[key])));
  }
}

describe("computeMeasures (Appendix A)", () => {
  it.each(MEASURES_EXAMPLES.map((example) => [example.name, example] as const))("%s", (_name, example) => {
    expectMeasures(computeMeasures(example.input.counters, example.input.elapsed), example.expected);
  });

  it("divides exactly, without rounding the accuracy", () => {
    expect(computeMeasures({ correctInserts: 1, totalInserts: 3 }, asDuration(60_000)).accuracy).toBe(100 / 3);
  });

  it("never caps: the largest value an accepted burst allows is returned as is", () => {
    expect(computeMeasures({ correctInserts: 20, totalInserts: 20 }, asDuration(1)).rawWpm).toBe(MAX_COMPUTABLE_WPM);
  });

  it("stays at or below MAX_COMPUTABLE_WPM for every plausible total, from 1 ms to an hour", () => {
    for (let milliseconds = 1; milliseconds <= 3_600_000; milliseconds = milliseconds < 100 ? milliseconds + 1 : Math.ceil(milliseconds * 1.01)) {
      const elapsed: Duration = asDuration(milliseconds);
      const inserts = maxPlausibleInserts(elapsed);
      expect(computeMeasures({ correctInserts: inserts, totalInserts: inserts }, elapsed).rawWpm).toBeLessThanOrEqual(MAX_COMPUTABLE_WPM);
    }
  });

  it("stays finite and exact at the largest counters and duration", () => {
    const measures = computeMeasures({ correctInserts: MAX_ENTRANT_INSERTS, totalInserts: MAX_ENTRANT_INSERTS }, asDuration(MAX_DURATION_MS));
    expect(Number.isFinite(measures.netWpm)).toBe(true);
    expect(measures.netWpm).toBe((MAX_ENTRANT_INSERTS * 12_000) / MAX_DURATION_MS);
    expect(measures.accuracy).toBe(100);
  });

  it.each([
    ["a fractional counter", { correctInserts: 1.5, totalInserts: 2 }],
    ["a negative counter", { correctInserts: -1, totalInserts: 2 }],
    ["more correct than total inserts", { correctInserts: 3, totalInserts: 2 }],
    ["a counter above the safe integers", { correctInserts: 0, totalInserts: Number.MAX_SAFE_INTEGER + 1 }],
    ["NaN", { correctInserts: Number.NaN, totalInserts: 1 }],
  ])("refuses %s as a programming error", (_label, counters) => {
    expect(() => computeMeasures(counters, asDuration(1_000))).toThrow(RangeError);
  });

  it("refuses an elapsed time that is not a valid duration", () => {
    expect(() => computeMeasures({ correctInserts: 1, totalInserts: 1 }, 1.5 as Duration)).toThrow(RangeError);
  });
});
