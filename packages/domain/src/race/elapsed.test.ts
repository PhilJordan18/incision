import { describe, expect, it } from "vitest";
import { asInstant, MAX_INSTANT } from "../time";
import { measuredElapsed } from "./elapsed";

const startsAt = asInstant(1_000_000);
const at = (milliseconds: number) => asInstant(1_000_000 + milliseconds);

describe("measuredElapsed", () => {
  it("is 0 during the countdown and for an abandon before the start", () => {
    expect(measuredElapsed(startsAt, at(-1_500))).toBe(0);
    expect(measuredElapsed(startsAt, at(5_000), at(-2_000))).toBe(0);
  });

  it("runs from the start while racing", () => {
    expect(measuredElapsed(startsAt, at(0))).toBe(0);
    expect(measuredElapsed(startsAt, at(42_000))).toBe(42_000);
  });

  it("freezes at the entrant's end", () => {
    expect(measuredElapsed(startsAt, at(90_000), at(30_000))).toBe(30_000);
  });

  it("stays exact beyond seven days: a race with no limit is never clamped", () => {
    const eightDays = 8 * 24 * 60 * 60 * 1_000;
    expect(measuredElapsed(startsAt, at(eightDays))).toBe(eightDays);
    expect(measuredElapsed(startsAt, at(eightDays + 1))).toBe(eightDays + 1);
  });

  it("stays exact over the whole range of accepted instants", () => {
    expect(measuredElapsed(asInstant(0), asInstant(MAX_INSTANT))).toBe(MAX_INSTANT);
  });
});
