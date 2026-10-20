import type { EntrantId, RaceId } from "../ids";
import type { EntrantKind } from "../race/start";
import type { EntrantStatus, RacePhase } from "../race/types";
import type { RandomState } from "../random/prng";

/** D-11/D-16. This version fixes the award order and random draw policy, not effect application. */
export const BONUS_AWARDS_VERSION = 1;
export const BONUS_MILESTONES = [25, 50, 75] as const;
export type BonusMilestone = (typeof BONUS_MILESTONES)[number];
/** Equal probability, in this stable order. These are grants, not already-applied effects. */
export const BONUS_KINDS = ["shortenSelf", "extendLeader", "fogLeader"] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];

export type BonusParticipant = {
  readonly entrantId: EntrantId;
  readonly kind: EntrantKind;
};

/** The tuple (raceId, milestone, entrantId) identifies a grant; no ambient/random ID needed. */
export type BonusGrant = {
  readonly entrantId: EntrantId;
  readonly milestone: BonusMilestone;
  readonly kind: BonusKind;
};

/** Private server state. Never expose the random stream or other players' inventories publicly. */
export type BonusAwardsState = {
  readonly version: typeof BONUS_AWARDS_VERSION;
  readonly raceId: RaceId;
  readonly enabled: boolean;
  readonly participants: readonly BonusParticipant[];
  /** -1 before the first authoritative snapshot. */
  readonly revision: number;
  readonly phase: RacePhase;
  /** An ordered prefix of [25, 50, 75], including milestones with no recipients. */
  readonly milestones: readonly BonusMilestone[];
  /** Award history, not an activation queue. Consumption/expiry belong to the integration slice. */
  readonly grants: readonly BonusGrant[];
  readonly random: RandomState;
};

export type CreateBonusAwardsInput = {
  readonly raceId: RaceId;
  readonly enabled: boolean;
  readonly participants: readonly BonusParticipant[];
  /** A dedicated stream, independent of text generation and individual bots. */
  readonly random: RandomState;
};

export type BonusProgress = {
  readonly entrantId: EntrantId;
  readonly position: number;
  readonly length: number;
  readonly status: EntrantStatus;
};

/**
 * Derived from the authoritative race after EACH transition, never the 4 Hz public projection.
 * Countdown/end/expiry processing comes first. Include the entire frozen roster, even terminals.
 * Progress is validated graphemes / effective target length; never rounded display percentages.
 */
export type BonusAwardsSnapshot = {
  readonly raceId: RaceId;
  readonly revision: number;
  readonly phase: RacePhase;
  readonly entrants: readonly BonusProgress[];
};

export type BonusAwardsRefusal =
  | "INVALID_INPUT"
  | "INVALID_STATE"
  | "INVALID_ROSTER"
  | "INVALID_PROGRESS"
  | "INVALID_RANDOM_STATE"
  | "NOT_ENOUGH_PARTICIPANTS"
  | "NO_HUMAN_PARTICIPANT"
  | "WRONG_RACE"
  | "STALE_REVISION"
  | "INVALID_PHASE";

export type BonusAwardsResult =
  | { readonly ok: true; readonly state: BonusAwardsState; readonly grants: readonly BonusGrant[] }
  | { readonly ok: false; readonly reason: BonusAwardsRefusal };
