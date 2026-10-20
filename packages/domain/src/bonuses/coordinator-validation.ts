import { MAX_ENTRANT_INSERTS, MAX_TEXT_GRAPHEMES, TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "../race/limits";
import type { RaceState } from "../race/types";
import { singleGrapheme } from "../text/graphemes";
import { MAX_INSTANT } from "../time";
import type { BonusRaceState } from "./coordinator-types";
import { BONUS_FOG_MS } from "./effects";
import { stateValid } from "./validation";

const safe = (value: number, max = Number.MAX_SAFE_INTEGER): boolean => Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Structural/invariant checks on trusted stored state, not an authorization check or public JSON decoder. */
export function validBonusRace(state: BonusRaceState): boolean {
  try { return valid(state); } catch { return false; }
}

function valid(state: BonusRaceState): boolean {
  if (state.version !== 1 || !safe(state.revision) || !stateValid(state.awards) ||
    state.awards.revision !== state.revision || state.awards.raceId !== state.race.raceId ||
    state.awards.phase !== state.race.phase || !validRace(state.race)) return false;
  const entrants = state.race.entrants;
  if (entrants.length !== state.awards.participants.length ||
    entrants.some((entrant) => !state.awards.participants.some((item) => item.entrantId === entrant.entrantId && item.kind === entrant.kind))) return false;
  if (state.protection.length !== entrants.length || state.cursors.length !== entrants.length ||
    new Set(state.protection.map((item) => item.entrantId)).size !== entrants.length ||
    new Set(state.cursors.map((item) => item.entrantId)).size !== entrants.length) return false;
  for (const entrant of entrants) {
    const protection = state.protection.find((item) => item.entrantId === entrant.entrantId);
    const cursor = state.cursors.find((item) => item.entrantId === entrant.entrantId);
    if (!protection || !safe(protection.position, entrant.target.length) || protection.position < entrant.typed.length ||
      !cursor || !safe(cursor.seq) || (cursor.seq === 0) !== (cursor.last === undefined)) return false;
    if (cursor.last && (cursor.last.reply.seq !== cursor.seq || ![25, 50, 75].includes(cursor.last.milestone))) return false;
    if (cursor.last?.reply.ok) {
      const cached = cursor.last.reply.receipt;
      if (cached.grant.entrantId !== entrant.entrantId || cached.grant.milestone !== cursor.last.milestone ||
        !state.consumed.some((receipt) => JSON.stringify(receipt) === JSON.stringify(cached))) return false;
    }
  }
  if (state.consumed.length > entrants.length * 3 || new Set(state.consumed.map((item) => item.id)).size !== state.consumed.length) return false;
  for (const receipt of state.consumed) {
    const grant = state.awards.grants.find((item) => item.entrantId === receipt.grant.entrantId && item.milestone === receipt.grant.milestone);
    if (!grant || grant.kind !== receipt.grant.kind || receipt.id !== `${state.race.raceId}:${grant.entrantId}:${grant.milestone}` ||
      !entrants.some((item) => item.entrantId === receipt.targetId) || !safe(receipt.at, state.race.clock) || receipt.at < state.race.startsAt) return false;
  }
  if (state.fog.length > entrants.length || new Set(state.fog.map((item) => item.entrantId)).size !== state.fog.length ||
    ((state.race.phase === "ended" || state.race.phase === "interrupted") && state.fog.length !== 0)) return false;
  return state.fog.every((fog) => fog.raceId === state.race.raceId &&
    safe(fog.startsAt, state.race.clock) && safe(fog.expiresAt, MAX_INSTANT) && fog.expiresAt > state.race.clock &&
    fog.expiresAt - fog.startsAt === BONUS_FOG_MS && state.consumed.some((receipt) =>
      receipt.grant.kind === "fogLeader" && receipt.targetId === fog.entrantId && receipt.at === fog.startsAt));
}

function validRace(race: RaceState): boolean {
  // Repeated letters in 30 long targets need one segmentation per distinct value, not per position.
  // This cache belongs to this pure call; it never trusts a previous mutable state object.
  const checked = new Map<string, boolean>();
  const graphemeValid = (part: string): boolean => {
    if (!checked.has(part)) checked.set(part, singleGrapheme(part) === part);
    return checked.get(part) === true;
  };
  if (!safe(race.clock, MAX_INSTANT) || !safe(race.startsAt, MAX_INSTANT) || !safe(race.countdownAt, race.startsAt) ||
    !safe(race.revision) || !["free", "mandatory"].includes(race.errorMode) ||
    (race.timeLimit !== null && (!safe(race.timeLimit, TIME_LIMIT_MAX_MS) || race.timeLimit < TIME_LIMIT_MIN_MS || race.startsAt + race.timeLimit > MAX_INSTANT)) ||
    (race.endedAt !== undefined && !safe(race.endedAt, race.clock))) return false;
  if (new Set(race.entrants.map((entrant) => entrant.entrantId)).size !== race.entrants.length) return false;
  return race.entrants.every((entrant) => entrant.target.length > 0 && entrant.target.length <= MAX_TEXT_GRAPHEMES &&
    entrant.target.every(graphemeValid) && entrant.typed.length <= entrant.target.length &&
    entrant.typed.every(graphemeValid) && safe(entrant.textVersion) && safe(entrant.ackSeq) &&
    ["racing", "finished", "timedOut", "abandoned"].includes(entrant.status) &&
    (entrant.status !== "racing" || entrant.typed.length < entrant.target.length) &&
    (entrant.status !== "finished" || entrant.typed.length === entrant.target.length) &&
    safe(entrant.counters.totalInserts, MAX_ENTRANT_INSERTS) && safe(entrant.counters.correctInserts, entrant.counters.totalInserts) &&
    safe(entrant.lastActivityAt, MAX_INSTANT) && typeof entrant.inactive === "boolean" && typeof entrant.pendingError === "boolean" &&
    (entrant.endedAt === undefined || safe(entrant.endedAt, race.clock)) &&
    (entrant.disconnectedAt === undefined || safe(entrant.disconnectedAt, race.clock)) &&
    typeof entrant.missedKeys === "object" && entrant.missedKeys !== null && Object.values(entrant.missedKeys).every((value) => safe(value, MAX_ENTRANT_INSERTS)));
}
