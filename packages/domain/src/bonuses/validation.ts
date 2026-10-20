import { asEntrantId, asRaceId, compareIds } from "../ids";
import { startRefusal } from "../race/start";
import { asRandomState } from "../random/prng";
import { ROOM_MAX_CAPACITY } from "../rooms/room-admission";
import {
  BONUS_AWARDS_VERSION, BONUS_KINDS, BONUS_MILESTONES,
  type BonusAwardsRefusal, type BonusAwardsSnapshot, type BonusAwardsState,
  type BonusParticipant, type CreateBonusAwardsInput,
} from "./types";

const PHASES = ["countdown", "racing", "ended", "interrupted"];
const STATUSES = ["racing", "finished", "timedOut", "abandoned"];
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const safe = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && typeof value === "number" && value >= min;
const oneOf = (value: unknown, choices: readonly unknown[]): boolean => choices.includes(value);

function idValid(value: unknown, kind: "race" | "entrant"): boolean {
  if (typeof value !== "string") return false;
  try {
    if (kind === "race") asRaceId(value); else asEntrantId(value);
    return true;
  } catch { return false; }
}

function randomValid(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  try { asRandomState(value); return true; } catch { return false; }
}

function rosterValid(value: unknown): value is readonly BonusParticipant[] {
  if (!Array.isArray(value) || value.length > ROOM_MAX_CAPACITY) return false;
  const ids = new Set<string>();
  for (const participant of value) {
    if (!record(participant) || !idValid(participant.entrantId, "entrant") ||
      !oneOf(participant.kind, ["human", "bot"]) || typeof participant.entrantId !== "string" ||
      ids.has(participant.entrantId)) return false;
    ids.add(participant.entrantId);
  }
  return true;
}

export function creationRefusal(input: CreateBonusAwardsInput): BonusAwardsRefusal | undefined {
  if (!record(input) || !idValid(input.raceId, "race") || typeof input.enabled !== "boolean") return "INVALID_INPUT";
  if (!rosterValid(input.participants)) return "INVALID_ROSTER";
  const start = startRefusal(input.participants);
  if (start) return start;
  if (!randomValid(input.random)) return "INVALID_RANDOM_STATE";
  return undefined;
}

/** Check persisted state too: limits cannot be bypassed by malformed saved grant histories. */
export function stateValid(state: BonusAwardsState): boolean {
  if (!record(state) || creationRefusal(state) !== undefined || state.version !== BONUS_AWARDS_VERSION ||
    !safe(state.revision, -1) || !oneOf(state.phase, PHASES) ||
    !Array.isArray(state.milestones) || state.milestones.length > BONUS_MILESTONES.length ||
    !Array.isArray(state.grants) || state.grants.length > ROOM_MAX_CAPACITY * BONUS_MILESTONES.length) return false;
  // An initializer's revision cannot be confused with an already-processed snapshot.
  if (state.revision === -1 && (state.phase !== "countdown" || state.milestones.length !== 0)) return false;
  if ((!state.enabled || state.phase === "countdown") && state.milestones.length !== 0) return false;
  for (let i = 0; i < state.milestones.length; i++) {
    if (state.milestones[i] !== BONUS_MILESTONES[i]) return false;
  }
  for (let i = 1; i < state.participants.length; i++) {
    if (compareIds(state.participants[i - 1]!.entrantId, state.participants[i]!.entrantId) >= 0) return false;
  }
  const ids = new Set<string>(state.participants.map(({ entrantId }) => entrantId));
  let previousMilestone = 0;
  let previousId = "";
  for (const grant of state.grants) {
    if (!record(grant) || typeof grant.entrantId !== "string" || !ids.has(grant.entrantId) ||
      typeof grant.milestone !== "number" || !state.milestones.some((m) => m === grant.milestone) ||
      !oneOf(grant.kind, BONUS_KINDS)) return false;
    if (grant.milestone < previousMilestone ||
      (grant.milestone === previousMilestone && compareIds(grant.entrantId, previousId) <= 0)) return false;
    previousMilestone = grant.milestone;
    previousId = grant.entrantId;
  }
  return true;
}

export function snapshotRefusal(snapshot: BonusAwardsSnapshot, state: BonusAwardsState): BonusAwardsRefusal | undefined {
  if (!record(snapshot) || !idValid(snapshot.raceId, "race") ||
    !safe(snapshot.revision, 0) || !oneOf(snapshot.phase, PHASES)) return "INVALID_INPUT";
  if (snapshot.raceId !== state.raceId) return "WRONG_RACE";
  if (snapshot.revision < state.revision) return "STALE_REVISION";
  if (!Array.isArray(snapshot.entrants) || snapshot.entrants.length !== state.participants.length) return "INVALID_ROSTER";
  const remaining = new Set<string>(state.participants.map(({ entrantId }) => entrantId));
  for (const entrant of snapshot.entrants) {
    if (!record(entrant) || typeof entrant.entrantId !== "string" || !remaining.delete(entrant.entrantId)) return "INVALID_ROSTER";
    if (!safe(entrant.position, 0) || !safe(entrant.length, 1) || entrant.position > entrant.length ||
      !oneOf(entrant.status, STATUSES) ||
      (entrant.status === "finished" && entrant.position !== entrant.length)) return "INVALID_PROGRESS";
  }
  // Repeated revisions are no-ops: the first payload wins, even if a later valid payload differs.
  if (snapshot.revision === state.revision) return undefined;
  if ((state.phase !== "countdown" && snapshot.phase === "countdown") ||
    ((state.phase === "ended" || state.phase === "interrupted") && snapshot.phase !== state.phase)) return "INVALID_PHASE";
  return undefined;
}
