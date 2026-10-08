import { describe, expect, it } from "vitest";
import { asDuration, MAX_DURATION_MS } from "../time";
import { MAX_ENTRANT_INSERTS, maxPlausibleInserts } from "./limits";

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
});
