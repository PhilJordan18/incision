import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId, compareIds } from "./ids";
import { maxPlausibleInserts } from "./race/limits";
import { addDuration, asDuration, asInstant, elapsedBetween, MAX_DURATION_MS, MAX_INSTANT } from "./time";

describe("instants and durations", () => {
  it("accepts finite integers within bounds", () => {
    expect(asInstant(0)).toBe(0);
    expect(asInstant(MAX_INSTANT)).toBe(MAX_INSTANT);
    expect(asDuration(MAX_DURATION_MS)).toBe(MAX_DURATION_MS);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, MAX_INSTANT + 1])("refuses the instant %s", (value) => {
    expect(() => asInstant(value)).toThrow(RangeError);
  });

  it.each([Number.NaN, -1, 0.5, MAX_DURATION_MS + 1])("refuses the duration %s", (value) => {
    expect(() => asDuration(value)).toThrow(RangeError);
  });

  it("measures elapsed time forward only", () => {
    expect(elapsedBetween(asInstant(1_000), asInstant(4_000))).toBe(3_000);
    expect(() => elapsedBetween(asInstant(4_000), asInstant(1_000))).toThrow(RangeError);
    expect(addDuration(asInstant(1_000), asDuration(3_000))).toBe(4_000);
  });
});

describe("identifiers", () => {
  it("accepts server ids such as UUIDs", () => {
    expect(asRaceId("6f1c2a9e-2b7d-4c1e-9f00-1a2b3c4d5e6f")).toBe("6f1c2a9e-2b7d-4c1e-9f00-1a2b3c4d5e6f");
  });

  it.each(["", "a".repeat(65), "has space", "é"])("refuses %j", (value) => {
    expect(() => asEntrantId(value)).toThrow(RangeError);
  });

  it("orders ids by code unit, independently of any locale", () => {
    expect(["b", "a", "B", "_"].sort(compareIds)).toEqual(["B", "_", "a", "b"]);
  });
});

describe("maxPlausibleInserts (COURSE-06)", () => {
  it("allows a burst at the start, then 25 inserts per second", () => {
    expect(maxPlausibleInserts(asDuration(0))).toBe(20);
    expect(maxPlausibleInserts(asDuration(1_000))).toBe(45);
    expect(maxPlausibleInserts(asDuration(1_039))).toBe(45);
    expect(maxPlausibleInserts(asDuration(60_000))).toBe(1_520);
  });
});
