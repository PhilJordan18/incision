import { compareIds } from "../ids";
import { asInstant } from "../time";
import type { RankEntrants, RankInput, TerminalStatus } from "./types";

/** COURSE-10: finishers, then time-outs, then abandons. */
const GROUP_ORDER: Readonly<Record<TerminalStatus, number>> = { finished: 0, timedOut: 1, abandoned: 2 };

/**
 * The official order of a race (F-02.2, COURSE-10). Every rank from 1 to n is used once: exact ties
 * fall to accuracy, then to `compareIds`, so the order never depends on the input order. The input
 * is left untouched.
 */
export const rankEntrants: RankEntrants = (entrants) => {
  checkEntrants(entrants);
  return [...entrants].sort(compareForRank).map((entrant, index) => ({ entrantId: entrant.entrantId, rank: index + 1 }));
};

function compareForRank(left: RankInput, right: RankInput): number {
  const byGroup = GROUP_ORDER[left.status] - GROUP_ORDER[right.status];
  if (byGroup !== 0) {
    return byGroup;
  }
  const byMain = left.status === "finished" ? left.endedAt - right.endedAt : compareProgressDescending(left, right);
  if (byMain !== 0) {
    return byMain;
  }
  const byAccuracy = right.accuracy - left.accuracy;
  return byAccuracy !== 0 ? byAccuracy : compareIds(left.entrantId, right.entrantId);
}

/**
 * Higher progress first, compared exactly: `position ÷ length` against `otherPosition ÷ otherLength`
 * as integer cross-products, in BigInt so no product can lose precision.
 */
function compareProgressDescending(left: RankInput, right: RankInput): number {
  const leftAhead = BigInt(left.position) * BigInt(right.length);
  const rightAhead = BigInt(right.position) * BigInt(left.length);
  if (leftAhead === rightAhead) {
    return 0;
  }
  return leftAhead > rightAhead ? -1 : 1;
}

function checkEntrants(entrants: readonly RankInput[]): void {
  const seen = new Set<string>();
  for (const entrant of entrants) {
    if (seen.has(entrant.entrantId)) {
      throw new RangeError(`Duplicate entrant ${entrant.entrantId}`);
    }
    seen.add(entrant.entrantId);
    asInstant(entrant.endedAt);
    const { position, length, accuracy } = entrant;
    if (!Number.isSafeInteger(length) || length < 1 || !Number.isSafeInteger(position) || position < 0 || position > length) {
      throw new RangeError(`Invalid progress ${position}/${length} for ${entrant.entrantId}`);
    }
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
      throw new RangeError(`Invalid accuracy ${accuracy} for ${entrant.entrantId}`);
    }
  }
}
