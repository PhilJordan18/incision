/** Bounded SQL sufficient statistics, never the full personal history. */
export type ProfileStatisticsGroup = {
  readonly outcome: "finished" | "timed_out" | "abandoned";
  readonly rank: number;
  readonly hasOtherHuman: boolean;
  readonly count: number;
  readonly averageNetWpm: number;
  readonly averageAccuracy: number;
  readonly bestNetWpm: number;
};

export type ProfileStatistics = {
  readonly raceCount: number;
  readonly victories: number;
  readonly averageNetWpm: number | null;
  readonly averageAccuracy: number | null;
  readonly bestNetWpm: number | null;
};

/** Three outcomes × 30 ranks × presence/absence of another human. */
export const MAX_PROFILE_GROUPS = 180;
export const PROFILE_TREND_LIMIT = 30;

/**
 * AUTH-06 / D-24. The adapter supplies only results of completed races belonging
 * to the authenticated account. Interrupted races are excluded before grouping.
 * Every outcome contributes to arithmetic per-race averages; only finishers set
 * a record. A victory also requires rank 1 and another human, not just bots.
 * Null means no measurement, distinct from a measured zero. No display rounding.
 */
export function computeProfileStatistics(groups: readonly ProfileStatisticsGroup[]): ProfileStatistics {
  if (groups.length > MAX_PROFILE_GROUPS) throw new Error("INVALID_PROFILE_GROUPS");
  let raceCount = 0;
  let victories = 0;
  let averageNetWpm = 0;
  let averageAccuracy = 0;
  let bestNetWpm: number | null = null;
  const seen = new Set<string>();
  for (const group of groups) {
    const key = `${group.outcome}:${group.rank}:${group.hasOtherHuman}`;
    if (seen.has(key) || !["finished", "timed_out", "abandoned"].includes(group.outcome)
      || !Number.isInteger(group.rank) || group.rank < 1 || group.rank > 30
      || typeof group.hasOtherHuman !== "boolean"
      || !Number.isSafeInteger(group.count) || group.count < 1
      || !Number.isSafeInteger(raceCount + group.count)
      || !Number.isFinite(group.averageNetWpm) || group.averageNetWpm < 0
      || !Number.isFinite(group.bestNetWpm) || group.bestNetWpm < group.averageNetWpm
      || !Number.isFinite(group.averageAccuracy) || group.averageAccuracy < 0 || group.averageAccuracy > 100) {
      throw new Error("INVALID_PROFILE_GROUPS");
    }
    seen.add(key);
    raceCount += group.count;
    // Weighted means avoid overflowing a sum of large, otherwise finite speeds.
    const weight = group.count / raceCount;
    averageNetWpm += (group.averageNetWpm - averageNetWpm) * weight;
    averageAccuracy += (group.averageAccuracy - averageAccuracy) * weight;
    if (group.outcome === "finished") {
      bestNetWpm = Math.max(bestNetWpm ?? 0, group.bestNetWpm);
      if (group.rank === 1 && group.hasOtherHuman) victories += group.count;
    }
  }
  return { raceCount, victories, bestNetWpm,
    averageNetWpm: raceCount === 0 ? null : averageNetWpm,
    averageAccuracy: raceCount === 0 ? null : averageAccuracy };
}
