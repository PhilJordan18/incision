import { describe, expect, it } from "vitest";
import { addDuration, asDuration, asInstant, elapsedBetween, MAX_DURATION_MS, MAX_INSTANT } from "./time";

describe("instants and durations", () => {
  it("accepts finite integers within bounds", () => {
    expect(asInstant(0)).toBe(0);
    expect(asInstant(MAX_INSTANT)).toBe(MAX_INSTANT);
    expect(asDuration(MAX_DURATION_MS)).toBe(MAX_DURATION_MS);
    expect(MAX_DURATION_MS).toBe(MAX_INSTANT);
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
    expect(() => addDuration(asInstant(MAX_INSTANT), asDuration(1))).toThrow(RangeError);
  });
});
