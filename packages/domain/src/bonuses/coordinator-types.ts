import type { EntrantId, RaceId } from "../ids";
import type { RaceEvent, RaceOutput, RaceState } from "../race/types";
import type { Instant } from "../time";
import type { BonusEffectRefusal, BonusFog } from "./effects";
import type { BonusAwardsState, BonusGrant, BonusMilestone } from "./types";

export type ActivationRefusal = BonusEffectRefusal | "INVALID_INPUT" | "BONUSES_DISABLED"
  | "UNKNOWN_GRANT" | "GRANT_CONSUMED" | "NOT_FIRST_GRANT" | "SEQUENCE_CONFLICT"
  | "STALE_SEQUENCE" | "OUT_OF_ORDER" | "SEQUENCE_EXHAUSTED" | "CONTENT_UNAVAILABLE";

/** Identity comes from authenticated server context, never from an arbitrary socket payload. */
export type ActivateBonus = {
  readonly type: "activate";
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  readonly milestone: BonusMilestone;
  readonly seq: number;
  readonly now: Instant;
};
export type BonusReceipt = {
  readonly id: string;
  readonly grant: BonusGrant;
  readonly targetId: EntrantId;
  readonly at: Instant;
};
export type ActivationReply =
  | { readonly ok: true; readonly seq: number; readonly receipt: BonusReceipt }
  | { readonly ok: false; readonly seq: number; readonly reason: ActivationRefusal };
export type ActivationCursor = {
  readonly entrantId: EntrantId;
  readonly seq: number;
  readonly last?: { readonly milestone: BonusMilestone; readonly reply: ActivationReply };
};

/** Entirely private, trusted server-owned envelope; never a client snapshot or authentication proof. */
export type BonusRaceState = {
  readonly version: 1;
  readonly race: RaceState;
  readonly awards: BonusAwardsState;
  /** Complete envelope revision, NOT race.revision (which only tracks the legacy public view). */
  readonly revision: number;
  readonly protection: readonly { readonly entrantId: EntrantId; readonly position: number }[];
  readonly cursors: readonly ActivationCursor[];
  /** Bounded by three per entrant; unused inventory is derived, never duplicated. */
  readonly consumed: readonly BonusReceipt[];
  readonly fog: readonly BonusFog[];
};
export type BonusAnnouncement =
  | { readonly type: "activated"; readonly receipt: BonusReceipt }
  | { readonly type: "fogExpired"; readonly id: string; readonly entrantId: EntrantId; readonly at: Instant };
export type BonusRaceOutput = {
  readonly state: BonusRaceState;
  readonly raceOutput: RaceOutput;
  readonly activation?: ActivationReply;
  readonly announcements: readonly BonusAnnouncement[];
  readonly nextDeadline?: Instant;
};
export type BonusRaceEvent = RaceEvent | ActivateBonus;
/**
 * Approved content only. Called after ownership/FIFO/target checks, never for a retry.
 * Must be pure and validate the full suffix boundary, language/options/exclusions; undefined
 * means unavailable. Do not mutate a shared PRNG or make I/O here. The grant identifies the draw.
 */
export type BonusContent = (input: {
  readonly race: RaceState; readonly grant: BonusGrant; readonly targetId: EntrantId;
}) => readonly string[] | undefined;
