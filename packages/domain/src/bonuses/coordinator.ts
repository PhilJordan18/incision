import { createRace } from "../race/create";
import { reduceRace } from "../race/reduce";
import type { CreateRaceInput, RaceState } from "../race/types";
import type { RandomState } from "../random/prng";
import { asInstant, MAX_INSTANT } from "../time";
import { awardBonuses, createBonusAwards } from "./awards";
import type { ActivateBonus, ActivationReply, BonusAnnouncement, BonusContent, BonusRaceEvent, BonusRaceOutput, BonusRaceState, BonusReceipt } from "./coordinator-types";
import { activeLeader, applyBonusEffect, type BonusEffect } from "./effects";
import { BONUS_MILESTONES, type BonusGrant } from "./types";
import { validBonusRace } from "./coordinator-validation";

/** Start at creation, not halfway through a race: previous typing high-water marks cannot be inferred. */
export function createBonusRace(input: { readonly race: CreateRaceInput; readonly enabled: boolean; readonly random: RandomState }) {
  const created = createRace(input.race);
  if (!created.ok) return created;
  const awards = createBonusAwards({ raceId: created.race.raceId, participants: input.race.participants, enabled: input.enabled, random: input.random });
  if (!awards.ok) return awards;
  const state: BonusRaceState = {
    version: 1, race: created.race, awards: awards.state, revision: 0,
    protection: created.race.entrants.map(({ entrantId }) => ({ entrantId, position: 0 })),
    cursors: created.race.entrants.map(({ entrantId }) => ({ entrantId, seq: 0 })), consumed: [], fog: [],
  };
  return { ok: true as const, state: observeAwards(state) };
}

export type ReduceBonusRaceResult =
  | ({ readonly ok: true } & BonusRaceOutput)
  | { readonly ok: false; readonly state: BonusRaceState; readonly reason: "INVALID_STATE" | "INVALID_TIME" | "REVISION_EXHAUSTED" };

/** Serialize calls on one authoritative envelope. This is not a distributed lock or SQL transaction. */
export function reduceBonusRace(state: BonusRaceState, event: BonusRaceEvent, content?: BonusContent): ReduceBonusRaceResult {
  if (!validBonusRace(state)) return { ok: false, state, reason: "INVALID_STATE" };
  if (!validTime(event.now) || (event.type === "inactivityPaused" && (!validTime(event.since) || event.since > event.now))) return { ok: false, state, reason: "INVALID_TIME" };
  if (state.revision === Number.MAX_SAFE_INTEGER || state.race.revision === Number.MAX_SAFE_INTEGER) return { ok: false, state, reason: "REVISION_EXHAUSTED" };
  // Expiries commit even if activation fails. Activation is a tick, never typing/presence activity.
  const raceOutput = reduceRace(state.race, event.type === "activate" ? { type: "tick", now: event.now } : event);
  const announcements: BonusAnnouncement[] = [];
  let next: BonusRaceState = { ...state, race: raceOutput.state };
  if (raceOutput.typingProgress) {
    const progress = raceOutput.typingProgress;
    next = { ...next, protection: next.protection.map((item) => item.entrantId === progress.entrantId
      ? { ...item, position: Math.max(item.position, progress.furthestPosition) } : item) };
  }
  const terminal = final(next.race);
  const retainedFog = next.fog.filter((fog) => {
    if (!terminal && fog.expiresAt > next.race.clock) return true;
    const at = terminal ? asInstant(Math.min(fog.expiresAt, next.race.endedAt ?? next.race.clock)) : fog.expiresAt;
    announcements.push({ type: "fogExpired", id: `${next.race.raceId}:${fog.entrantId}:${fog.startsAt}:expired`, entrantId: fog.entrantId, at });
    return false;
  });
  next = { ...next, fog: retainedFog };
  let activation: ActivationReply | undefined;
  if (event.type === "activate") {
    const activated = activate(next, event, content);
    next = activated.state;
    activation = activated.reply;
    if (activated.receipt) announcements.push({ type: "activated", receipt: activated.receipt });
  }
  const changed = !sameCoordinatorState(next, state);
  next = changed ? observeAwards({ ...next, revision: state.revision + 1 }) : state;
  const deadlines = [raceOutput.nextDeadline, ...next.fog.map((fog) => fog.expiresAt)].filter((at) => at !== undefined);
  const nextDeadline = deadlines.length === 0 ? undefined : asInstant(Math.min(...deadlines));
  return { ok: true, state: next, raceOutput: { ...raceOutput, state: next.race }, announcements,
    ...(activation === undefined ? {} : { activation }), ...(nextDeadline === undefined ? {} : { nextDeadline }) };
}

/** Compare only replaced branches. Reducers preserve unmodified targets and entrants.
 * JSON remains the value oracle for replaced leaves, including optional fields.
 * No result is cached across calls, and validation above still inspects all state.
 */
function sameCoordinatorState(left: BonusRaceState, right: BonusRaceState): boolean {
  const { race: leftRace, ...leftEnvelope } = left;
  const { race: rightRace, ...rightEnvelope } = right;
  const { entrants: leftEntrants, ...leftFields } = leftRace;
  const { entrants: rightEntrants, ...rightFields } = rightRace;
  if (JSON.stringify(leftFields) !== JSON.stringify(rightFields) ||
    JSON.stringify(leftEnvelope) !== JSON.stringify(rightEnvelope) || leftEntrants.length !== rightEntrants.length) return false;
  return leftEntrants.every((entrant, index) => {
    const other = rightEntrants[index]!;
    if (entrant === other) return true;
    const { target, typed, ...fields } = entrant;
    const { target: otherTarget, typed: otherTyped, ...otherFields } = other;
    return (target === otherTarget || JSON.stringify(target) === JSON.stringify(otherTarget)) &&
      (typed === otherTyped || JSON.stringify(typed) === JSON.stringify(otherTyped)) &&
      JSON.stringify(fields) === JSON.stringify(otherFields);
  });
}

function validTime(instant: number): boolean { return Number.isSafeInteger(instant) && instant >= 0 && instant <= MAX_INSTANT; }

function final(race: RaceState): boolean { return race.phase === "ended" || race.phase === "interrupted"; }

function observeAwards(state: BonusRaceState): BonusRaceState {
  const result = awardBonuses(state.awards, { raceId: state.race.raceId, revision: state.revision, phase: state.race.phase,
    entrants: state.race.entrants.map((entrant) => ({ entrantId: entrant.entrantId, position: entrant.typed.length, length: entrant.target.length, status: entrant.status })) });
  if (!result.ok) throw new RangeError(`Invalid internal bonus snapshot: ${result.reason}`);
  return { ...state, awards: result.state };
}

type Activated = { readonly state: BonusRaceState; readonly reply: ActivationReply; readonly receipt?: BonusReceipt };
function activate(state: BonusRaceState, intent: ActivateBonus, content?: BonusContent): Activated {
  const refused = (reason: Extract<ActivationReply, { ok: false }>["reason"]): Activated => ({ state, reply: { ok: false, seq: intent.seq, reason } });
  if (intent.raceId !== state.race.raceId) return refused("WRONG_RACE");
  const cursor = state.cursors.find((item) => item.entrantId === intent.entrantId);
  if (!cursor) return refused("UNKNOWN_ENTRANT");
  if (!Number.isSafeInteger(intent.seq) || intent.seq < 1 || !BONUS_MILESTONES.includes(intent.milestone)) return refused("INVALID_INPUT");
  if (intent.seq === cursor.seq && cursor.last) return cursor.last.milestone === intent.milestone
    ? { state, reply: cursor.last.reply } : refused("SEQUENCE_CONFLICT");
  if (intent.seq < cursor.seq) return refused("STALE_SEQUENCE");
  if (cursor.seq === Number.MAX_SAFE_INTEGER) return refused("SEQUENCE_EXHAUSTED");
  if (intent.seq !== cursor.seq + 1) return refused("OUT_OF_ORDER");
  const result = attempt(state, intent, content);
  // In-order refusals are acknowledged, but never consume a grant. A new attempt needs a new seq.
  return { ...result, state: { ...result.state, cursors: result.state.cursors.map((item) => item.entrantId === intent.entrantId
    ? { entrantId: item.entrantId, seq: intent.seq, last: { milestone: intent.milestone, reply: result.reply } } : item) } };
}

function attempt(state: BonusRaceState, intent: ActivateBonus, content?: BonusContent): Activated {
  const refused = (reason: Extract<ActivationReply, { ok: false }>["reason"]): Activated => ({ state, reply: { ok: false, seq: intent.seq, reason } });
  if (!state.awards.enabled) return refused("BONUSES_DISABLED");
  if (state.race.phase !== "racing") return refused("NOT_RACING");
  const actor = state.race.entrants.find((entrant) => entrant.entrantId === intent.entrantId)!;
  if (actor.status !== "racing") return refused("ENTRANT_TERMINAL");
  const grant = state.awards.grants.find((item) => item.entrantId === intent.entrantId && item.milestone === intent.milestone);
  if (!grant) return refused("UNKNOWN_GRANT");
  const consumed = (item: BonusGrant) => state.consumed.some((receipt) => receipt.grant.entrantId === item.entrantId && receipt.grant.milestone === item.milestone);
  if (consumed(grant)) return refused("GRANT_CONSUMED");
  if (state.awards.grants.find((item) => item.entrantId === intent.entrantId && !consumed(item)) !== grant) return refused("NOT_FIRST_GRANT");
  const target = grant.kind === "shortenSelf" ? actor : activeLeader(state.race, actor);
  if (!target) return refused("NO_VALID_TARGET");
  let effect: BonusEffect;
  if (grant.kind === "shortenSelf") {
    effect = { kind: grant.kind, protectedPosition: state.protection.find((item) => item.entrantId === actor.entrantId)!.position };
  } else if (grant.kind === "fogLeader") {
    const existingFog = state.fog.find((item) => item.entrantId === target.entrantId);
    effect = { kind: grant.kind, ...(existingFog === undefined ? {} : { existingFog }) };
  } else {
    let words: readonly string[] | undefined;
    try { words = content?.({ race: state.race, grant, targetId: target.entrantId }); }
    catch { return refused("CONTENT_UNAVAILABLE"); }
    if (words === undefined) return refused("CONTENT_UNAVAILABLE");
    if (!Array.isArray(words) || words.some((word) => typeof word !== "string")) return refused("INVALID_EXTENSION");
    effect = { kind: grant.kind, words };
  }
  const result = applyBonusEffect({ raceId: state.race.raceId, actorId: actor.entrantId, now: state.race.clock, race: state.race, effect });
  if (!result.ok) return refused(result.reason);
  const receipt: BonusReceipt = { id: `${state.race.raceId}:${actor.entrantId}:${grant.milestone}`, grant, targetId: result.entrant.entrantId, at: state.race.clock };
  return { state: { ...state,
    race: { ...state.race, entrants: state.race.entrants.map((entrant) => entrant.entrantId === result.entrant.entrantId ? result.entrant : entrant) },
    consumed: [...state.consumed, receipt], fog: result.fog ? [...state.fog, result.fog] : state.fog,
  }, reply: { ok: true, seq: intent.seq, receipt }, receipt };
}

/** Private owner inventory. Terminal races/entrants have no usable grants, even though history remains. */
export function availableBonusGrants(state: BonusRaceState, entrantId: ActivateBonus["entrantId"]): readonly BonusGrant[] {
  if (!validBonusRace(state) || !state.awards.enabled || state.race.phase !== "racing" ||
    !state.race.entrants.some((entrant) => entrant.entrantId === entrantId && entrant.status === "racing")) return [];
  return state.awards.grants.filter((grant) => grant.entrantId === entrantId &&
    !state.consumed.some((receipt) => receipt.grant.entrantId === entrantId && receipt.grant.milestone === grant.milestone));
}
