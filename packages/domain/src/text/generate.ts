/**
 * The race text for a host's settings (F-02.5): one entry point for both modes, its refusals in a
 * fixed priority, and the invariants checked on the final text, after every transformation.
 */
import { createRandom, PRNG_VERSION, type RandomState } from "../random/prng";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import { foldForExclusion, forbiddenPairRule } from "../words/pool";
import type { ExclusionList, TextLanguage, WordList } from "../words/types";
import { checkPassages, passageCut, type Passage } from "./coherent";
import { containsLineBreak, toGraphemes } from "./graphemes";
import { NORMALIZATION_VERSION } from "./normalize";
import { drawRandomText, randomContentRefusal, randomPlan, type RandomContentRefusal, type RandomPlan, type RandomWords } from "./random";
import {
  availableMarks,
  COMPLEXITY_CRITERIA,
  CRITERIA_VERSION,
  settingCharacter,
  textSettingsRefusal,
  type CoherentTextSettings,
  type Complexity,
  type ComplexityCriteria,
  type RandomTextSettings,
  type TextOptions,
  type TextSettingsRefusal,
} from "./settings";
import { HARD_TO_TYPE_LETTERS, MARKS, untypableCharacters, usesWordLetters } from "./typable";
import { countWords, isWordToken, tokensOf } from "./words";

export const TEXT_GENERATOR_VERSION = 1;

/**
 * Every refusal, in priority order (the first match wins). All are proven incompatibilities
 * except TEXT_SEARCH_EXHAUSTED: the bounded search ended without a text, which proves nothing.
 */
export type RaceTextRefusal = TextSettingsRefusal | "NO_COMPATIBLE_PASSAGE" | RandomContentRefusal | "TEXT_SEARCH_EXHAUSTED";

type RandomSources = { readonly settings: RandomTextSettings; readonly words: RandomWords };
type CoherentSources = { readonly settings: CoherentTextSettings; readonly passages: readonly Passage[] };
export type RaceTextSources = RandomSources | CoherentSources;

export type RaceTextInput = RaceTextSources & {
  /** Four uint32 drawn by the server with crypto for this text only; kept private (Q-15). */
  readonly state: RandomState;
  /** Defaults to COMPLEXITY_CRITERIA; validated, since a bad value could unbound the search. */
  readonly criteria?: Readonly<Record<Complexity, ComplexityCriteria>>;
};

export type RaceTextVersions = { readonly generator: number; readonly criteria: string; readonly normalization: number; readonly prng: string };

export type RaceTextResult =
  | {
      readonly ok: true;
      readonly text: string;
      readonly wordCount: number;
      readonly versions: RaceTextVersions;
      readonly provenance:
        | { readonly kind: "random"; readonly listVersion: string; readonly exclusionsVersion: string; readonly pairsVersion: string; readonly poolSize: number }
        | { readonly kind: "coherent"; readonly passageId: string };
    }
  | { readonly ok: false; readonly reason: RaceTextRefusal };

const isRandom = (sources: RaceTextSources): sources is RandomSources => sources.settings.kind === "random";

type Proven = Exclude<RaceTextRefusal, "TEXT_SEARCH_EXHAUSTED">;

type Prepared = {
  readonly refusal?: Proven;
  readonly plan?: RandomPlan;
  readonly compatible?: readonly { readonly passage: Passage; readonly cut: string }[];
};

/** The refusals that need no draw, with the random plan or the coherent cuts built once for the draw that follows. */
function prepare(sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>>, cuts: boolean): Prepared {
  const settingsRefusal = textSettingsRefusal(sources.settings, criteria);
  if (settingsRefusal !== undefined) return { refusal: settingsRefusal };
  if (isRandom(sources)) {
    const plan = randomPlan(sources.settings, sources.words, criteria[sources.settings.complexity]);
    return { refusal: randomContentRefusal(plan), plan };
  }
  checkPassages(sources.passages);
  const { settings } = sources;
  // A refusal needs one compatible passage; a draw needs them all.
  if (!cuts) return sources.passages.some((passage) => passageCut(passage, settings) !== undefined) ? {} : { refusal: "NO_COMPATIBLE_PASSAGE" };
  const compatible = sources.passages.flatMap((passage) => {
    const cut = passageCut(passage, settings);
    return cut === undefined ? [] : [{ passage, cut }];
  });
  return compatible.length > 0 ? { compatible } : { refusal: "NO_COMPATIBLE_PASSAGE" };
}

/** Every refusal that needs no draw, in priority order; never a text. */
export function raceTextRefusal(sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): Proven | undefined {
  return prepare(sources, criteria, false).refusal;
}

/**
 * Below this many distinct words, the interface warns the host that a random text will repeat its
 * words often (Q-7, F-03.1). A provisional diversity indicator, to calibrate with the real lists
 * (P-1): it proves neither that a text is impossible nor that it is unsafe, and the generator
 * promises no even spread of the words, whatever the pool.
 */
export const LOW_DIVERSITY_POOL_SIZE = 50;

export type RaceTextDiversity = { readonly poolSize: number; readonly lowDiversity: boolean };

/**
 * How many distinct words a random text may draw from, for the host's warning; undefined for
 * coherent settings and for settings textSettingsRefusal refuses. It stays defined when
 * raceTextRefusal refuses the content: the two answers are separate, and the interface shows a
 * refusal first. An empty pool is never a warning: raceTextRefusal refuses it
 * (NO_COMPATIBLE_WORDS). Server-side, since the lists are.
 */
export function raceTextDiversity(sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): RaceTextDiversity | undefined {
  if (!isRandom(sources) || textSettingsRefusal(sources.settings, criteria) !== undefined) return undefined;
  const poolSize = new Set(randomPlan(sources.settings, sources.words, criteria[sources.settings.complexity]).pool.map((word) => word.word)).size;
  return { poolSize, lowDiversity: poolSize > 0 && poolSize < LOW_DIVERSITY_POOL_SIZE };
}

export function generateRaceText(input: RaceTextInput): RaceTextResult {
  const criteria = input.criteria ?? COMPLEXITY_CRITERIA;
  const { refusal, plan, compatible } = prepare(input, criteria, true);
  if (refusal !== undefined) return { ok: false, reason: refusal };
  const random = createRandom(input.state);
  const versions: RaceTextVersions = { generator: TEXT_GENERATOR_VERSION, criteria: CRITERIA_VERSION, normalization: NORMALIZATION_VERSION, prng: PRNG_VERSION };
  if (isRandom(input)) {
    const { settings, words } = input;
    if (plan === undefined) throw new RangeError("A random request always has a plan");
    const draw = drawRandomText(plan, settings, criteria[settings.complexity], random);
    if (!draw.ok) return draw;
    assertValid(draw.text, input, criteria);
    return {
      ok: true,
      text: draw.text,
      wordCount: settings.wordCount,
      versions,
      provenance: { kind: "random", listVersion: words.list.version, exclusionsVersion: words.exclusions.version, pairsVersion: words.pairs.version, poolSize: draw.poolSize },
    };
  }
  const { settings, passages } = input;
  if (compatible === undefined) throw new RangeError("A coherent request always has its cuts");
  const chosen = compatible[random.index(compatible.length)];
  if (chosen === undefined) throw new RangeError("raceTextRefusal and the coherent draw disagree");
  assertValid(chosen.cut, { settings, passages }, criteria);
  return { ok: true, text: chosen.cut, wordCount: settings.wordCount, versions, provenance: { kind: "coherent", passageId: chosen.passage.id } };
}

const MARK_SET: ReadonlySet<string> = new Set(MARKS);
const NUMBER = /^\d+$/u;
const LEADING = /^[^\p{L}\p{N}]+/u;
const TRAILING = /(?<=[\p{L}\p{N}])[^\p{L}\p{N}]+$/u;
// Closing quotes and parentheses in any order: a coherent passage may end « (enfin.) » as `(enfin.)"`.
const TERMINAL_END = /[.!?][")]*$/u;
const FRENCH_HIGH = /[;:!?]/u;

const coreOf = (token: string): string => token.replace(LEADING, "").replace(TRAILING, "").toLowerCase();

/** A token's word core, its leading and trailing marks removed, in lowercase: the unit of the word rules. */
export const tokenCore = coreOf;
/** Whether a core is a number, which the pair and repetition rules see through. */
export const isNumberCore = (core: string): boolean => NUMBER.test(core);
/** Whether a token ends a sentence: ".", "!" or "?", then possibly closing quotes and parentheses. */
export const endsSentence = (token: string): boolean => TERMINAL_END.test(token);

/** The folded exclusions, built once per list object (lists are frozen data). */
const EXCLUDED = new WeakMap<ExclusionList, ReadonlySet<string>>();
function excludedOf(list: ExclusionList): ReadonlySet<string> {
  let excluded = EXCLUDED.get(list);
  if (excluded === undefined) {
    excluded = new Set(list.words.map(foldForExclusion));
    EXCLUDED.set(list, excluded);
  }
  return excluded;
}

export type DrawnWordContext = {
  readonly language: TextLanguage;
  readonly options: TextOptions;
  readonly level: ComplexityCriteria;
  readonly words: RandomWords;
  /** The settings' excluded characters, already through settingCharacter. */
  readonly excludedCharacters: readonly string[];
};

/**
 * The rules a drawn word keeps, as [holds, rule] pairs, read from the list, the exclusions and the
 * alphabet themselves, never from a pool: a faulty pool cannot vouch for itself. A rule never names
 * the word. Shared by the final checks of random texts and of extension words.
 */
export function drawnWordChecks(core: string, context: DrawnWordContext): readonly (readonly [boolean, string])[] {
  const { language, options, level, words, excludedCharacters } = context;
  return [
    [(zipfOf(words.list).get(core) ?? Number.NEGATIVE_INFINITY) >= level.minZipf, `words from the list, at Zipf ${level.minZipf} or more`],
    [[...core].length <= level.maxLetters, `words of at most ${level.maxLetters} letters`],
    [!excludedOf(words.exclusions).has(foldForExclusion(core)), "no excluded word"],
    [usesWordLetters(core, language) && ![...core].some((character) => HARD_TO_TYPE_LETTERS.includes(character) || excludedCharacters.includes(character)), "words of allowed letters only"],
    [options.accents || /^[a-z']+$/u.test(core), "no diacritic in a word with accents off"],
  ];
}

/** The list's Zipf lookup, built once per list object. */
const ZIPF = new WeakMap<WordList, ReadonlyMap<string, number>>();
function zipfOf(list: WordList): ReadonlyMap<string, number> {
  let zipf = ZIPF.get(list);
  if (zipf === undefined) {
    zipf = new Map(list.entries.map((entry) => [entry.word, entry.zipf]));
    ZIPF.set(list, zipf);
  }
  return zipf;
}

/**
 * Every guarantee the final text breaks, after all transformations; empty for a valid text. The
 * random checks read the list, the exclusions and the alphabet directly, never the pool, so a
 * faulty pool cannot vouch for itself. generateRaceText throws on any: a broken guarantee is a bug.
 * A rule never names a word of the text: one may be an excluded word, and rules reach logs.
 */
export function raceTextViolations(text: string, sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): readonly string[] {
  const { options, language, wordCount } = sources.settings;
  const violations = new Set<string>();
  const check = (holds: boolean, rule: string): void => {
    if (!holds) violations.add(rule);
  };
  const tokens = tokensOf(text);
  check(text === text.normalize("NFC") && !/\s{2}|^\s|\s$/u.test(text) && !/[^\S ]/u.test(text), "one plain space between tokens, NFC");
  check(!containsLineBreak(text), "no line break (D-16)");
  check(toGraphemes(text).length <= MAX_TEXT_GRAPHEMES, "at most MAX_TEXT_GRAPHEMES");
  check(untypableCharacters(text, language).length === 0, "typable characters only");
  check(countWords(text) === wordCount, `exactly ${wordCount} words`);
  check(options.numbers || !/\p{N}/u.test(text), "no digit with numbers off");
  check(options.punctuation || (![...text].some((character) => MARK_SET.has(character)) && !tokens.some((token) => /^['-]|['-]$/u.test(token))), "no mark with punctuation off");
  check(options.capitals || text === text.toLowerCase(), "no capital with capitals off");
  check(options.accents || !/[^ -~]/u.test(text), "no diacritic with accents off");
  if (!isRandom(sources)) return [...violations];

  const { settings, words } = sources;
  const level = criteria[settings.complexity];
  const characters = (inputs: readonly string[]): string[] => inputs.map((input) => settingCharacter(input, language) ?? "").filter((character) => character !== "");
  const excludedCharacters = characters(settings.exclude);
  const context: DrawnWordContext = { language, options, level, words, excludedCharacters };
  const rule = forbiddenPairRule(words.pairs);
  const lower = text.toLowerCase();
  const cores = tokens.filter(isWordToken).map(coreOf);
  for (const core of cores) {
    if (NUMBER.test(core)) {
      check(options.numbers && Number(core) <= level.maxNumber && !(core.length > 1 && core.startsWith("0")), `numbers up to ${level.maxNumber}, without a leading zero`);
      continue;
    }
    for (const [holds, rule] of drawnWordChecks(core, context)) check(holds, rule);
  }
  check(!excludedCharacters.some((character) => lower.includes(character)), "no excluded character");
  check(characters(settings.include).every((character) => lower.includes(character)), "every included character");
  // Neighbours are the words around a number too: "sale 12 juif" counts as "sale juif".
  const sequence = cores.filter((core) => !NUMBER.test(core));
  let multiWordPool: boolean | undefined;
  for (let index = 1; index < sequence.length; index += 1) {
    const [left, right] = [sequence[index - 1] ?? "", sequence[index] ?? ""];
    if (left === right) {
      multiWordPool ??= randomPlan(settings, words, level).pool.length >= 2;
      check(!multiWordPool, "no word twice in a row");
    }
    check(!rule(left, right), "no forbidden pair side by side");
  }
  check(!options.numbers || cores.some((core) => NUMBER.test(core)), "at least one number with numbers on");
  // A drawn text wraps whole words, so its marks pair up; a passage cut may stop inside a pair.
  let depth = 0;
  for (const character of text) {
    depth += character === "(" ? 1 : character === ")" ? -1 : 0;
    if (depth < 0) break;
  }
  check(depth === 0 && [...text].filter((character) => character === '"').length % 2 === 0, "quotes and parentheses in pairs");
  const marks = availableMarks(settings, level);
  if (options.punctuation) {
    const used = [...text].filter((character) => MARK_SET.has(character));
    check(used.length > 0, "at least one mark with punctuation on");
    check(used.every((mark) => marks.includes(mark as (typeof marks)[number])), "marks from the available set only");
    check(
      tokens.every((token) => (language === "fr" ? !FRENCH_HIGH.test(token) || /^[;:!?]$/u.test(token) : !/^[;:!?]$/u.test(token))),
      language === "fr" ? "a space before each ; : ! ? in French" : "no space before ; : ! ? in English",
    );
  }
  // Every sentence starts with a word (Q-2), capitalised when capitals are on. When every sentence end
  // shows a mark, the starts are all visible, and capitals appear nowhere else.
  const startsSentence = (index: number): boolean => index === 0 || TERMINAL_END.test(tokens[index - 1] ?? "");
  check(!tokens.some((token, index) => startsSentence(index) && !/^["(]?\p{L}/u.test(token)), "a word at each sentence start");
  if (options.capitals) {
    check(!tokens.some((token, index) => startsSentence(index) && !/^["(]?\p{Lu}/u.test(token)), "a capital at each sentence start");
    const endsVisible = options.punctuation && marks.some((mark) => mark === "." || mark === "?" || mark === "!");
    check(!endsVisible || !tokens.some((token, index) => !startsSentence(index) && /\p{Lu}/u.test(token)), "capitals only at sentence starts");
  }
  return [...violations];
}

function assertValid(text: string, sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>>): void {
  const violations = raceTextViolations(text, sources, criteria);
  if (violations.length > 0) {
    throw new RangeError(`Generated text breaks a guarantee: ${violations.join("; ")}`);
  }
}
