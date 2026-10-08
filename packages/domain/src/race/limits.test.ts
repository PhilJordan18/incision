import { describe, expect, it } from "vitest";
import { asDuration, MAX_DURATION_MS } from "../time";
import { MAX_COMPUTABLE_WPM, MAX_ENTRANT_INSERTS, maxPlausibleInserts } from "./limits";

describe("maxPlausibleInserts (COURSE-06)", () => {
  it("allows a burst at the start, then 25 inserts per second", () => {
    expect(maxPlausibleInserts(asDuration(0))).toBe(20);
    expect(maxPlausibleInserts(asDuration(1_000))).toBe(45);
    expect(maxPlausibleInserts(asDuration(1_039))).toBe(45);
    expect(maxPlausibleInserts(asDuration(60_000))).toBe(1_520);
  });

  it("bounds every entrant's counters for stored columns", () => {
    expect(MAX_ENTRANT_INSERTS).toBe(maxPlausibleInserts(asDuration(MAX_DURATION_MS)));
    expect(MAX_ENTRANT_INSERTS).toBe(15_120_020);
    expect(Number.isSafeInteger(MAX_ENTRANT_INSERTS)).toBe(true);
  });

  it("derives the largest computable WPM from the limits: 20 inserts after 1 ms", () => {
    expect(MAX_COMPUTABLE_WPM).toBe(240_000);
    // Raw WPM at the plausibility limit, from 1 ms to an hour, never exceeds the bound.
    for (let ms = 1; ms <= 3_600_000; ms = ms < 100 ? ms + 1 : Math.ceil(ms * 1.01)) {
      const wpm = (maxPlausibleInserts(asDuration(ms)) / 5) * (60_000 / ms);
      expect(wpm).toBeLessThanOrEqual(MAX_COMPUTABLE_WPM);
    }
  });
});
