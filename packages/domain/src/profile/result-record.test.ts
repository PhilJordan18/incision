import { describe, expect, it } from "vitest";
import { compareResultRecord, resultRecordCategory } from "./result-record";

const category = { bonuses: false, errorMode: "mandatory" } as const;
describe("record at the time of a race", () => {
  it("compares without rounding, distinguishes zero from absence and recognises exact ties", () => {
    for (const [netWpm, previousBest, status] of [
      [0, null, "first"], [0, 0, "tied"], [40.004, 40.003, "improved"],
      [40.003, 40.004, "below"], [40.004, 40.004, "tied"],
    ] as const) expect(compareResultRecord({ category, netWpm, previousBest, historyComplete: true })).toEqual({ category, status });
  });
  it("does not fabricate a record from incomplete history or invalid numbers", () => {
    expect(compareResultRecord({ category, netWpm: 50, previousBest: null, historyComplete: false })).toEqual({ status: "unavailable" });
    for (const invalid of [-1, Infinity, NaN]) {
      expect(compareResultRecord({ category, netWpm: invalid, previousBest: 1, historyComplete: true }).status).toBe("unavailable");
      expect(compareResultRecord({ category, netWpm: 1, previousBest: invalid, historyComplete: true }).status).toBe("unavailable");
    }
  });
  it("validates all four categories without coercing legacy configurations", () => {
    for (const bonuses of [true, false]) for (const errorMode of ["mandatory", "free"] as const) {
      expect(resultRecordCategory({ bonuses, errorMode, language: "fr" })).toEqual({ bonuses, errorMode });
    }
    for (const unknown of [null, [], {}, { bonuses: false }, { bonuses: "false", errorMode: "mandatory" }, { bonuses: true, errorMode: "other" }]) {
      expect(resultRecordCategory(unknown)).toBeUndefined();
    }
  });
});
