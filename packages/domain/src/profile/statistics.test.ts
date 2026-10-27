import { describe, expect, it } from "vitest";
import { computeProfileStatistics, type ProfileStatisticsGroup } from "./statistics";

const finished: ProfileStatisticsGroup = { outcome: "finished", rank: 1, hasOtherHuman: true,
  count: 2, averageNetWpm: 50, averageAccuracy: 90, bestNetWpm: 60 };

describe("private profile statistics", () => {
  it("distinguishes no measurement from measured zero", () => {
    expect(computeProfileStatistics([])).toEqual({ raceCount: 0, victories: 0,
      averageNetWpm: null, averageAccuracy: null, bestNetWpm: null });
    expect(computeProfileStatistics([{ ...finished, averageNetWpm: 0, bestNetWpm: 0, averageAccuracy: 0 }]))
      .toEqual({ raceCount: 2, victories: 2, averageNetWpm: 0, averageAccuracy: 0, bestNetWpm: 0 });
  });

  it("weights every completed-race result equally, not every group equally", () => {
    const result = computeProfileStatistics([finished,
      { ...finished, outcome: "timed_out", count: 1, averageNetWpm: 20, bestNetWpm: 20, averageAccuracy: 60 },
      { ...finished, outcome: "abandoned", count: 1, averageNetWpm: 0, bestNetWpm: 0, averageAccuracy: 0 }]);
    expect(result).toEqual({ raceCount: 4, victories: 2, averageNetWpm: 30, averageAccuracy: 60, bestNetWpm: 60 });
  });

  it("does not award victory for a solo/bots-only opponent, non-first place or non-finisher", () => {
    const result = computeProfileStatistics([
      { ...finished, hasOtherHuman: false }, { ...finished, rank: 2 },
      { ...finished, outcome: "timed_out", bestNetWpm: 900 },
      { ...finished, outcome: "abandoned", bestNetWpm: 800 }]);
    expect(result).toMatchObject({ raceCount: 8, victories: 0, bestNetWpm: 60 });
    expect(computeProfileStatistics([{ ...finished, outcome: "abandoned" }]).bestNetWpm).toBeNull();
  });

  it("matches an independent expanded per-race mean and does not round", () => {
    const speeds = [50 / 3, 50 / 3, 50 / 3, 7 / 3];
    const groups = [{ ...finished, count: 3, averageNetWpm: 50 / 3 },
      { ...finished, rank: 2, count: 1, averageNetWpm: 7 / 3 }];
    for (const input of [groups, [...groups].reverse()]) {
      expect(computeProfileStatistics(input).averageNetWpm).toBeCloseTo(speeds.reduce((a, b) => a + b) / speeds.length, 12);
    }
  });

  it("refuses invalid, duplicate or unbounded aggregate input", () => {
    for (const patch of [{ count: 0 }, { count: 1.5 }, { count: Infinity }, { rank: 31 }, { rank: 0 },
      { averageNetWpm: NaN }, { averageNetWpm: -1 }, { averageAccuracy: 101 }, { bestNetWpm: 49 }]) {
      expect(() => computeProfileStatistics([{ ...finished, ...patch }])).toThrow("INVALID_PROFILE_GROUPS");
    }
    expect(() => computeProfileStatistics([finished, finished])).toThrow("INVALID_PROFILE_GROUPS");
    expect(() => computeProfileStatistics(Array.from({ length: 181 }, () => finished))).toThrow("INVALID_PROFILE_GROUPS");
    expect(() => computeProfileStatistics([{ ...finished, count: Number.MAX_SAFE_INTEGER }, { ...finished, rank: 2 }]))
      .toThrow("INVALID_PROFILE_GROUPS");
  });
});
