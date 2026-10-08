import { describe, expect, it } from "vitest";
import { asInstant, MAX_DURATION_MS } from "../time";
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

  it("caps a race left open instead of throwing", () => {
    expect(measuredElapsed(startsAt, at(MAX_DURATION_MS + 1))).toBe(MAX_DURATION_MS);
  });
});
