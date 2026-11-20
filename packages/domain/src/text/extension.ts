/**
 * Extension words for the extendLeader bonus (F-02.6, #129): three words drawn from the approved
 * lists, deterministically, for a target text. The server wires them into the coordinator's
 * `BonusContent` (#62); a refusal there becomes `CONTENT_UNAVAILABLE`, which never consumes a grant.
 *
 * - The result is a pure function of all its inputs: the seed, the grant identity, the target's
 *   text, the settings, the criteria, the word data (contents and versions) and
 *   EXTENSION_DRAW_VERSION. Identical inputs give the identical result; any change may change it.
 * - The seed is private and frozen for the race; each call derives its own generator from it and
 *   the grant identity (see `extensionState`). No shared stream is consumed, and the result never
 *   depends on the order of other events.
 * - The words are deterministic, not unpredictable: the derivation is not cryptographic. Before
 *   any extension of a race is shown, they depend on the race's private seed; each extension shown
 *   reveals part of the derived state, and with the public lists the first words of two or three
 *   extensions in a race let anyone compute the first word of that race's other extensions. This
 *   is acceptable: the words come only from the approved lists, the grant's owner can neither
 *   choose nor redraw them, and they are shown to the race as soon as they are added. The seed
 *   serves only this purpose, so nothing else is revealed: no other random stream, no other race.
 * - The words follow the race's language, band and options, avoid œ and æ (P-4) and the excluded
 *   words and characters, and never repeat or form a forbidden pair with their neighbour, the
 *   target's last word included (numbers are transparent, as in random mode). Coherent races draw
 *   from the lists too: the extension does not continue the story.
 * - With capitals and punctuation on, the first word takes a capital only when the target's last
 *   token ends a sentence; every other word stays lowercase.
 * - The search is bounded. EXTENSION_SEARCH_EXHAUSTED proves nothing; the other refusals are proofs
 *   or data checks. The shipped hand-written fixtures (`fixture-*` versions) are refused unless a
 *   test says otherwise, so production never falls back to them.
 */
import { BONUS_MILESTONES, type BonusMilestone } from "../bonuses/types";
import { asEntrantId, asRaceId, type EntrantId, type RaceId } from "../ids";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import { asRandomState, createRandom, type RandomState } from "../random/prng";
import { forbiddenPairRule } from "../words/pool";
import { TEXT_LANGUAGES, type TextLanguage } from "../words/types";
import { toGraphemes } from "./graphemes";
import { drawnWordChecks, endsSentence, isNumberCore, tokenCore } from "./generate";
import { randomPlan, type RandomWords } from "./random";
import { checkCriteria, COMPLEXITIES, COMPLEXITY_CRITERIA, MIN_TEXT_WORDS, settingCharacter, type Complexity, type ComplexityCriteria, type TextOptions } from "./settings";
import { isWordToken, tokensOf } from "./words";

/** Changes with the draw algorithm or its bounds: a different version may give different words. */
export const EXTENSION_DRAW_VERSION = 1;
/** Changes with the key encoding or the mix; it is part of the key. */
export const EXTENSION_MIX_VERSION = 1;
/** Draws for one word, and restarts of the whole triple: at most 3 × 64 × 4 draws per call. */
export const EXTENSION_DRAWS_PER_SLOT = 64;
export const EXTENSION_RESTARTS = 4;
export const EXTENSION_WORDS = 3;

export type ExtensionSettings = {
  readonly language: TextLanguage;
  readonly complexity: Complexity;
  readonly options: TextOptions;
  /** A random race's excluded characters; absent for a coherent race. */
  readonly exclude?: readonly string[];
};

/** The identity of a grant (`BonusGrant`): the race, the grant's owner and its milestone. */
export type ExtensionGrant = { readonly raceId: RaceId; readonly entrantId: EntrantId; readonly milestone: BonusMilestone };

export type ExtensionInput = {
  readonly settings: ExtensionSettings;
  /** Approved data; the shipped `fixture-*` data are refused. */
  readonly words: RandomWords;
  /** The target's current effective text. */
  readonly target: string;
  /** Private, drawn once with crypto for the race, frozen: never advanced. */
  readonly seed: RandomState;
  readonly grant: ExtensionGrant;
  readonly criteria?: Readonly<Record<Complexity, ComplexityCriteria>>;
  /** Tests only: accept the shipped `fixture-*` data. */
  readonly allowFixtureData?: true;
};

export type ExtensionRefusal = "NO_COMPATIBLE_WORDS" | "NO_ROOM" | "FIXTURE_DATA" | "EXTENSION_SEARCH_EXHAUSTED";

export type ExtensionDraw =
  | { readonly ok: true; readonly words: readonly [string, string, string] }
  | { readonly ok: false; readonly reason: ExtensionRefusal };

/**
 * The key of a grant: "incision-extension-mix/<EXTENSION_MIX_VERSION>|<raceId>|<entrantId>|<milestone>".
 * Ids match [A-Za-z0-9_-] (ids.ts), so "|" cannot occur inside them; the milestone is decimal.
 * RangeError for an invalid part, which only a bug can produce.
 */
export function extensionKey(grant: ExtensionGrant): string {
  if (!BONUS_MILESTONES.includes(grant.milestone)) throw new RangeError("Unknown bonus milestone");
  return `incision-extension-mix/${EXTENSION_MIX_VERSION}|${asRaceId(grant.raceId)}|${asEntrantId(grant.entrantId)}|${grant.milestone}`;
}

/** FNV-1a offset bases of the four lanes, then the murmur3 32-bit finaliser. */
const LANES = [0x811c9dc5, 0x050c5d1f, 0x9e3779b9, 0x85ebca6b] as const;
const ZERO_REPLACEMENT: RandomState = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344];

function fmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The generator state of one grant. Each of four FNV-1a lanes, with its own offset basis, hashes the
 * seed's 16 bytes (the four words, little-endian), then the key's bytes (ASCII by construction), and
 * goes through the murmur3 finaliser: every word of the state depends on the whole seed and the whole
 * key. An all-zero result becomes a fixed constant. Pure, documented, versioned, not cryptographic.
 */
export function extensionState(seed: RandomState, grant: ExtensionGrant): RandomState {
  const checked = asRandomState(seed);
  const key = extensionKey(grant);
  const bytes = [...checked.flatMap((word) => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, word >>> 24]), ...Array.from(key, (character) => character.charCodeAt(0))];
  const state = LANES.map((basis) => {
    let hash = basis;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return fmix32(hash);
  });
  return state.every((word) => word === 0) ? ZERO_REPLACEMENT : asRandomState(state);
}

/**
 * The target's last word and whether its last token ends a sentence, with random mode's token rules.
 * Numbers are transparent: a word token without a letter ("12", "3,5", "10:30", "1914-1918") is a
 * number, since coherent passages hold more than random mode's integers.
 */
export function extensionJunction(target: string): { readonly lastWord?: string; readonly sentenceEnd: boolean } {
  const tokens = tokensOf(target);
  const words = tokens.filter(isWordToken).map(tokenCore).filter((core) => !isNumberCore(core) && /\p{L}/u.test(core));
  return { ...(words.length > 0 ? { lastWord: words[words.length - 1] } : {}), sentenceEnd: endsSentence(tokens[tokens.length - 1] ?? "") };
}

const isFixture = (words: RandomWords): boolean => [words.list.version, words.exclusions.version, words.pairs.version].some((version) => version.startsWith("fixture"));

/** The pool a race of these settings draws from, exactly as random mode builds it. */
function extensionPool(input: ExtensionInput, criteria: Readonly<Record<Complexity, ComplexityCriteria>>) {
  const { language, complexity, options, exclude = [] } = input.settings;
  const settings = { kind: "random", language, complexity, wordCount: MIN_TEXT_WORDS, options: { ...options, numbers: false }, include: [], exclude } as const;
  return randomPlan(settings, input.words, criteria[complexity]).pool.map((entry) => entry.word);
}

/** With capitals on, the first word takes a capital only after a visible sentence end: punctuation on. */
const capitalised = (settings: ExtensionSettings, junction: { readonly sentenceEnd: boolean }): boolean =>
  settings.options.capitals && settings.options.punctuation && junction.sentenceEnd;

export function drawExtensionWords(input: ExtensionInput): ExtensionDraw {
  const criteria = input.criteria ?? COMPLEXITY_CRITERIA;
  checkCriteria(criteria);
  if (!TEXT_LANGUAGES.includes(input.settings.language) || !COMPLEXITIES.includes(input.settings.complexity)) {
    throw new RangeError("Unknown text language or complexity");
  }
  const random = createRandom(extensionState(input.seed, input.grant));
  if (isFixture(input.words) && input.allowFixtureData !== true) return { ok: false, reason: "FIXTURE_DATA" };
  const pool = extensionPool(input, criteria);
  if (pool.length === 0) return { ok: false, reason: "NO_COMPATIBLE_WORDS" };
  // Three words, each after a space, must fit under the race's grapheme bound.
  const room = MAX_TEXT_GRAPHEMES - toGraphemes(input.target).length;
  const lengths = pool.map((word) => [...word].length);
  // A loop, not Math.min(...lengths): spreading a list of 125,000 words or more overflows the stack.
  let shortest = Number.POSITIVE_INFINITY;
  for (const length of lengths) shortest = Math.min(shortest, length);
  if (EXTENSION_WORDS * (shortest + 1) > room) return { ok: false, reason: "NO_ROOM" };
  const forbidden = forbiddenPairRule(input.words.pairs);
  const junction = extensionJunction(input.target);
  for (let restart = 0; restart < EXTENSION_RESTARTS; restart += 1) {
    const chosen: string[] = [];
    let left = room;
    for (let slot = 0; slot < EXTENSION_WORDS; slot += 1) {
      const previous = slot === 0 ? junction.lastWord : chosen[slot - 1];
      // Leave room for the words still to come, at their shortest.
      const budget = left - (EXTENSION_WORDS - slot - 1) * (shortest + 1) - 1;
      for (let draw = 0; draw < EXTENSION_DRAWS_PER_SLOT; draw += 1) {
        const index = random.index(pool.length);
        const word = pool[index] as string;
        if ((lengths[index] as number) > budget) continue;
        if (previous !== undefined && (word === previous || forbidden(previous, word))) continue;
        chosen.push(word);
        left -= (lengths[index] as number) + 1;
        break;
      }
      if (chosen.length === slot) break;
    }
    if (chosen.length === EXTENSION_WORDS) {
      const [first = "", second = "", third = ""] = chosen;
      const capital = capitalised(input.settings, junction);
      return { ok: true, words: [capital ? first.charAt(0).toUpperCase() + first.slice(1) : first, second, third] };
    }
  }
  return { ok: false, reason: "EXTENSION_SEARCH_EXHAUSTED" };
}

/**
 * Every rule a drawn triple breaks, read from the list, the exclusions, the pairs and the alphabet
 * themselves (`drawnWordChecks`, shared with random mode's final checks), never from the pool or
 * the draw. Empty for a valid triple. A rule never names a word.
 */
export function extensionViolations(input: ExtensionInput, words: readonly string[]): readonly string[] {
  const violations = new Set<string>();
  const check = (holds: boolean, rule: string): void => {
    if (!holds) violations.add(rule);
  };
  const criteria = input.criteria ?? COMPLEXITY_CRITERIA;
  const { language, complexity, options, exclude = [] } = input.settings;
  const context = {
    language,
    options,
    level: criteria[complexity],
    words: input.words,
    excludedCharacters: exclude.map((character) => settingCharacter(character, language) ?? "").filter((character) => character !== ""),
  };
  check(words.length === EXTENSION_WORDS, "exactly three words");
  const junction = extensionJunction(input.target);
  const forbidden = forbiddenPairRule(input.words.pairs);
  const capital = capitalised(input.settings, junction);
  words.forEach((word, index) => {
    const lower = word.toLowerCase();
    for (const [holds, rule] of drawnWordChecks(lower, context)) check(holds, rule);
    check(isWordToken(word) && word === word.normalize("NFC") && !word.includes(" "), "word tokens, NFC, no space");
    check(index === 0 && capital ? word === lower.charAt(0).toUpperCase() + lower.slice(1) : word === lower, "a capital on the first word only after a sentence end, with capitals on");
    const previous = index === 0 ? junction.lastWord : words[index - 1]?.toLowerCase();
    if (previous !== undefined) {
      check(lower !== previous, "no word next to the same word");
      check(!forbidden(previous, lower), "no forbidden pair side by side");
    }
  });
  check(toGraphemes(`${input.target} ${words.join(" ")}`).length <= MAX_TEXT_GRAPHEMES, "the text stays within MAX_TEXT_GRAPHEMES");
  return [...violations];
}
