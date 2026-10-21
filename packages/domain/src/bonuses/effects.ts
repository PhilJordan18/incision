import type { EntrantId, RaceId } from "../ids";
import { MAX_TEXT_GRAPHEMES, RACE_MIN_PARTICIPANTS } from "../race/limits";
import type { EntrantState, RaceState } from "../race/types";
import { ROOM_MAX_CAPACITY } from "../rooms/room-admission";
import { singleGrapheme, toGraphemes } from "../text/graphemes";
import { countWords, cutToWords, isWordToken } from "../text/words";
import { asInstant, MAX_INSTANT, type Instant } from "../time";

export const BONUS_FOG_MS = 3_000;

/** Server-owned metadata, not a CSS instruction or a cryptographic capability. */
export type BonusFog = {
  readonly raceId: RaceId;
  readonly entrantId: EntrantId;
  readonly startsAt: Instant;
  readonly expiresAt: Instant;
};

export type BonusEffect =
  | {
      readonly kind: "shortenSelf";
      /**
       * Furthest accepted position EVER reached, including intermediate inserts before backspace
       * in a batch. The future coordinator must observe each applied insert, not just batch ends.
       * Keep this across suffix edits; reset only for a new race.
       */
      readonly protectedPosition: number;
    }
  | { readonly kind: "extendLeader"; readonly words: readonly string[] }
  | { readonly kind: "fogLeader"; readonly existingFog?: BonusFog };

export type BonusEffectRefusal =
  | "WRONG_RACE"
  | "NOT_RACING"
  | "INVALID_STATE"
  | "UNKNOWN_ENTRANT"
  | "ENTRANT_TERMINAL"
  | "NO_VALID_TARGET"
  | "INVALID_PROTECTED_POSITION"
  | "NO_REMOVABLE_WORD"
  | "INVALID_EXTENSION"
  | "TEXT_TOO_LONG"
  | "TEXT_VERSION_EXHAUSTED"
  | "INVALID_TIME"
  | "FOG_ALREADY_ACTIVE";

export type BonusEffectResult =
  | { readonly ok: false; readonly reason: BonusEffectRefusal }
  | {
      readonly ok: true;
      /** A replacement for this entrant only, NOT an independently committed race transition. */
      readonly entrant: EntrantState;
      readonly kind: BonusEffect["kind"];
      readonly fog?: BonusFog;
    };

export type BonusEffectInput = {
  readonly raceId: RaceId;
  readonly actorId: EntrantId;
  /**
   * Authoritative state after reduceRace has processed deadlines at now. No client state.
   * Authorization, grant ownership, idempotency and atomic commit belong to the coordinator.
   */
  readonly race: RaceState;
  readonly now: Instant;
  readonly effect: BonusEffect;
};

const refused = (reason: BonusEffectRefusal): BonusEffectResult => ({ ok: false, reason });
const validTime = (value: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= MAX_INSTANT;

/**
 * Effect primitives only (F-06.1 slice B). Does not consume a grant, advance a race revision,
 * process deadlines, publish an announcement, or provide retry safety. Never expose as a socket
 * handler. A refusal changes nothing, including inventory; the future coordinator commits a
 * success atomically with grant consumption and the race transition.
 */
export function applyBonusEffect(input: BonusEffectInput): BonusEffectResult {
  const { race, now, actorId, effect } = input;
  if (input.raceId !== race.raceId) return refused("WRONG_RACE");
  if (!validTime(now) || now !== race.clock) return refused("INVALID_TIME");
  if (race.phase !== "racing") return refused("NOT_RACING");
  if (!validRoster(race)) return refused("INVALID_STATE");
  const actor = race.entrants.find((entrant) => entrant.entrantId === actorId);
  if (actor === undefined) return refused("UNKNOWN_ENTRANT");
  if (actor.status !== "racing") return refused("ENTRANT_TERMINAL");
  if (effect.kind === "shortenSelf") return shorten(actor, effect.protectedPosition);
  const target = activeLeader(race, actor);
  if (target === undefined) return refused("NO_VALID_TARGET");
  if (effect.kind === "extendLeader") return extend(target, effect.words);
  if (effect.kind === "fogLeader") return fog(target, input);
  return refused("INVALID_STATE");
}

/** Exact ratios; roster order never decides a leader, and the actor must actually trail it. */
export function activeLeader(race: RaceState, actor: EntrantState): EntrantState | undefined {
  let leader: EntrantState | undefined;
  for (const entrant of race.entrants) {
    if (entrant.entrantId === actor.entrantId || entrant.status !== "racing" || compareProgress(entrant, actor) <= 0) continue;
    if (leader === undefined || compareProgress(entrant, leader) > 0 ||
      (compareProgress(entrant, leader) === 0 && entrant.entrantId < leader.entrantId)) leader = entrant;
  }
  return leader;
}

function compareProgress(left: EntrantState, right: EntrantState): number {
  const delta = BigInt(left.typed.length) * BigInt(right.target.length) - BigInt(right.typed.length) * BigInt(left.target.length);
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

/** Validate the data used by these primitives; full RaceState provenance remains the server's job. */
function validRoster(race: RaceState): boolean {
  if (race.entrants.length < RACE_MIN_PARTICIPANTS || race.entrants.length > ROOM_MAX_CAPACITY) return false;
  const ids = new Set(race.entrants.map((entrant) => entrant.entrantId));
  return ids.size === race.entrants.length && race.entrants.every((entrant) =>
    entrant.target.length > 0 && entrant.target.length <= MAX_TEXT_GRAPHEMES &&
    entrant.typed.length <= entrant.target.length &&
    (entrant.status !== "racing" || entrant.typed.length < entrant.target.length) &&
    ["racing", "finished", "timedOut", "abandoned"].includes(entrant.status) &&
    Number.isSafeInteger(entrant.textVersion) && entrant.textVersion >= 0 &&
    entrant.target.every((part) => singleGrapheme(part) === part) &&
    toGraphemes(entrant.target.join("")).length === entrant.target.length);
}

function replaceText(entrant: EntrantState, target: readonly string[], kind: BonusEffect["kind"]): BonusEffectResult {
  if (entrant.textVersion === Number.MAX_SAFE_INTEGER) return refused("TEXT_VERSION_EXHAUSTED");
  return { ok: true, kind, entrant: { ...entrant, target, textVersion: entrant.textVersion + 1 } };
}

function shorten(entrant: EntrantState, protectedPosition: number): BonusEffectResult {
  if (!Number.isSafeInteger(protectedPosition) || protectedPosition < entrant.typed.length ||
    protectedPosition < 0 || protectedPosition > entrant.target.length) return refused("INVALID_PROTECTED_POSITION");
  const text = entrant.target.join("");
  if (!normalizedSpacing(text)) return refused("INVALID_STATE");
  const total = countWords(text);
  // At zero typing protect the first word. On a space protect that exact expected space, too.
  // A mandatory error protects the expected grapheme although it was not accepted.
  const protectedLength = protectedPosition;
  for (let removed = Math.min(3, total - 1); removed >= 1; removed -= 1) {
    const candidate = cutToWords(text, total - removed);
    const target = toGraphemes(candidate);
    // Strictly longer than typed preserves the expected grapheme even at zero typing/on a space.
    if (target.length < protectedLength || target.length <= entrant.typed.length || !balanced(candidate)) continue;
    if (!entrant.target.slice(0, protectedLength).every((part, index) => target[index] === part)) continue;
    // cutToWords always retains a whole word: a protected prefix cannot be cut mid-word.
    return replaceText(entrant, target, "shortenSelf");
  }
  return refused("NO_REMOVABLE_WORD");
}

function extend(entrant: EntrantState, words: readonly string[]): BonusEffectResult {
  if (words.length !== 3 || words.some((word) =>
    word.length > MAX_TEXT_GRAPHEMES || !isWordToken(word) || !normalizedSpacing(word) ||
    word.includes(" ") || word !== word.normalize("NFC") || !balanced(word) ||
    !toGraphemes(word).every((part) => singleGrapheme(part) === part))) return refused("INVALID_EXTENSION");
  const text = entrant.target.join("");
  if (!normalizedSpacing(text)) return refused("INVALID_STATE");
  const target = toGraphemes(`${text} ${words.join(" ")}`);
  if (target.length > MAX_TEXT_GRAPHEMES) return refused("TEXT_TOO_LONG");
  return replaceText(entrant, target, "extendLeader");
}

function normalizedSpacing(text: string): boolean {
  return text.length > 0 && text === text.trim() && !text.includes("  ") && !/[^\S ]/u.test(text);
}

/** A conservative cut: never leave an unclosed parenthesis or double quote in the retained text. */
function balanced(text: string): boolean {
  const stack: string[] = [];
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (character === "(") stack.push(character);
    if (character === ")" && stack.pop() === undefined) return false;
  }
  return stack.length === 0 && !quoted;
}

function fog(entrant: EntrantState, input: BonusEffectInput): BonusEffectResult {
  const { now, raceId, effect } = input;
  if (effect.kind !== "fogLeader") return refused("INVALID_STATE");
  const existing = effect.existingFog;
  if (existing !== undefined) {
    if (!validFog(existing) || existing.raceId !== raceId || existing.entrantId !== entrant.entrantId ||
      existing.startsAt > now) return refused("INVALID_STATE");
    if (bonusFogActive(existing, now)) return refused("FOG_ALREADY_ACTIVE");
  }
  if (now > MAX_INSTANT - BONUS_FOG_MS) return refused("INVALID_TIME");
  return { ok: true, kind: "fogLeader", entrant, fog: { raceId, entrantId: entrant.entrantId, startsAt: now, expiresAt: asInstant(now + BONUS_FOG_MS) } };
}

function validFog(value: BonusFog): boolean {
  return validTime(value.startsAt) && validTime(value.expiresAt) && value.expiresAt - value.startsAt === BONUS_FOG_MS;
}

/** Half-open [start, expiry). Invalid persisted metadata never produces an active effect. */
export function bonusFogActive(value: BonusFog, now: Instant): boolean {
  return validTime(now) && validFog(value) && now >= value.startsAt && now < value.expiresAt;
}
