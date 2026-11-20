import { compareIds } from "../ids";
import { asRandomState, createRandom } from "../random/prng";
import {
  BONUS_AWARDS_VERSION, BONUS_KINDS, BONUS_MILESTONES,
  type BonusAwardsResult, type BonusAwardsSnapshot, type BonusAwardsState,
  type BonusGrant, type BonusProgress, type CreateBonusAwardsInput,
} from "./types";
import { creationRefusal, snapshotRefusal, stateValid } from "./validation";

/** Freeze the roster and enabled setting at creation. Spectators never belong in participants. */
export function createBonusAwards(input: CreateBonusAwardsInput): BonusAwardsResult {
  const reason = creationRefusal(input);
  if (reason) return { ok: false, reason };
  return {
    ok: true, grants: [],
    state: {
      version: BONUS_AWARDS_VERSION, raceId: input.raceId, enabled: input.enabled,
      participants: input.participants.map(({ entrantId, kind }) => ({ entrantId, kind }))
        .sort((a, b) => compareIds(a.entrantId, b.entrantId)),
      revision: -1, phase: "countdown", milestones: [], grants: [], random: asRandomState(input.random),
    },
  };
}

/**
 * D-11/D-16, award slice only. Call after each authoritative transition and its due expiry rules.
 * A terminal race issues nothing, including when its last entrant just finished.
 * Multiple crossed milestones use the same post-transition snapshot (no invented intermediate
 * positions), in ascending order. Even an empty milestone is consumed permanently.
 * Seed/inventory are private. The caller must not substitute a client progress prediction here.
 */
export function awardBonuses(state: BonusAwardsState, snapshot: BonusAwardsSnapshot): BonusAwardsResult {
  if (!stateValid(state)) return { ok: false, reason: "INVALID_STATE" };
  const reason = snapshotRefusal(snapshot, state);
  if (reason) return { ok: false, reason };
  if (snapshot.revision === state.revision) return { ok: true, state, grants: [] };
  const next = { ...state, revision: snapshot.revision, phase: snapshot.phase };
  if (!state.enabled || snapshot.phase !== "racing") return { ok: true, state: next, grants: [] };

  const contenders = snapshot.entrants.filter(({ status }) => status === "racing" || status === "finished");
  const active = contenders.filter(({ status }) => status === "racing");
  const leader = contenders.reduce<BonusProgress | undefined>(
    (best, entrant) => !best || compareProgress(entrant, best) > 0 ? entrant : best, undefined,
  );
  if (!leader) return { ok: true, state: next, grants: [] };
  const crossed = BONUS_MILESTONES.filter((milestone) => !state.milestones.includes(milestone) &&
    BigInt(leader.position) * BigInt(100) >= BigInt(leader.length) * BigInt(milestone));
  if (crossed.length === 0) return { ok: true, state: next, grants: [] };

  const last = active.reduce<BonusProgress | undefined>(
    (worst, entrant) => !worst || compareProgress(entrant, worst) < 0 ? entrant : worst, undefined,
  );
  const recipients = active.filter((entrant) => compareProgress(entrant, leader) < 0 &&
    ((last !== undefined && compareProgress(entrant, last) === 0) || farBehind(entrant, leader)))
    .sort((a, b) => compareIds(a.entrantId, b.entrantId));
  const random = createRandom(state.random);
  const grants: BonusGrant[] = [];
  for (const milestone of crossed) {
    for (const entrant of recipients) {
      // One visit per canonical entrant/milestone; three milestones bound lifetime awards to three.
      grants.push({ entrantId: entrant.entrantId, milestone, kind: BONUS_KINDS[random.index(BONUS_KINDS.length)]! });
    }
  }
  return {
    ok: true, grants,
    state: { ...next, milestones: [...state.milestones, ...crossed], grants: [...state.grants, ...grants], random: random.state() },
  };
}

function compareProgress(left: BonusProgress, right: BonusProgress): number {
  const difference = BigInt(left.position) * BigInt(right.length) - BigInt(right.position) * BigInt(left.length);
  return difference === BigInt(0) ? 0 : difference > BigInt(0) ? 1 : -1;
}

/** Strictly greater than 25 percentage points. Products remain exact near JS's safe integer limit. */
function farBehind(entrant: BonusProgress, leader: BonusProgress): boolean {
  const gap = BigInt(leader.position) * BigInt(entrant.length) - BigInt(entrant.position) * BigInt(leader.length);
  return gap * BigInt(100) > BigInt(25) * BigInt(leader.length) * BigInt(entrant.length);
}
