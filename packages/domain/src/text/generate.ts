/**
 * The race text for a host's settings (F-02.5): one entry point for both modes, its refusals in a
 * fixed priority, and the invariants checked on the final text, after every transformation.
 */
import { createRandom, PRNG_VERSION, type RandomState } from "../random/prng";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import { foldForExclusion, forbiddenPairRule } from "../words/pool";
import { checkPassages, passageCut, type Passage } from "./coherent";
import { containsLineBreak, toGraphemes } from "./graphemes";
import { NORMALIZATION_VERSION } from "./normalize";
import { drawRandomText, randomContentRefusal, randomPool, type RandomContentRefusal, type RandomWords } from "./random";
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

export type RaceTextSources =
  | { readonly settings: RandomTextSettings; readonly words: RandomWords }
  | { readonly settings: CoherentTextSettings; readonly passages: readonly Passage[] };

export type RaceTextInput = RaceTextSources & {
  /** Four uint32 drawn by the server with crypto for this text only; kept private (Q-15). */
  readonly state: RandomState;
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

const isRandom = (sources: RaceTextSources): sources is Extract<RaceTextSources, { readonly words: RandomWords }> => sources.settings.kind === "random";

/** Every refusal that needs no draw, in priority order; never a text. */
export function raceTextRefusal(sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): Exclude<RaceTextRefusal, "TEXT_SEARCH_EXHAUSTED"> | undefined {
  const settingsRefusal = textSettingsRefusal(sources.settings, criteria);
  if (settingsRefusal !== undefined) return settingsRefusal;
  if (isRandom(sources)) {
    return randomContentRefusal(sources.settings, sources.words, criteria[sources.settings.complexity]);
  }
  const coherent = sources as Extract<RaceTextSources, { readonly passages: readonly Passage[] }>;
  checkPassages(coherent.passages);
  return coherent.passages.some((passage) => passageCut(passage, coherent.settings) !== undefined) ? undefined : "NO_COMPATIBLE_PASSAGE";
}

export function generateRaceText(input: RaceTextInput): RaceTextResult {
  const criteria = input.criteria ?? COMPLEXITY_CRITERIA;
  const refusal = raceTextRefusal(input, criteria);
  if (refusal !== undefined) return { ok: false, reason: refusal };
  const random = createRandom(input.state);
  const versions: RaceTextVersions = { generator: TEXT_GENERATOR_VERSION, criteria: CRITERIA_VERSION, normalization: NORMALIZATION_VERSION, prng: PRNG_VERSION };
  if (isRandom(input)) {
    const { settings, words } = input;
    const draw = drawRandomText(settings, words, criteria[settings.complexity], random);
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
  const { settings, passages } = input as Extract<RaceTextInput, { readonly passages: readonly Passage[] }>;
  const compatible = passages.flatMap((passage) => {
    const cut = passageCut(passage, settings);
    return cut === undefined ? [] : [{ passage, cut }];
  });
  const chosen = compatible[random.index(compatible.length)];
  if (chosen === undefined) throw new RangeError("raceTextRefusal and the coherent draw disagree");
  assertValid(chosen.cut, { settings, passages }, criteria);
  return { ok: true, text: chosen.cut, wordCount: settings.wordCount, versions, provenance: { kind: "coherent", passageId: chosen.passage.id } };
}

const MARK_SET: ReadonlySet<string> = new Set(MARKS);
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const NUMBER = /^\d+$/u;

/**
 * Every guarantee the final text breaks, after all transformations; empty for a valid text.
 * generateRaceText throws on any: a broken guarantee is a bug, never a retry or a silent fix.
 */
export function raceTextViolations(text: string, sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): readonly string[] {
  const { settings } = sources;
  const { options, language, wordCount } = settings;
  const violations: string[] = [];
  const check = (holds: boolean, rule: string): void => {
    if (!holds) violations.push(rule);
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
  if (!isRandom(sources)) return violations;

  const random = sources as Extract<RaceTextSources, { readonly words: RandomWords }>;
  const characters = (inputs: readonly string[]): string[] => inputs.map((input) => settingCharacter(input, language) ?? "").filter((character) => character !== "");
  const level = criteria[random.settings.complexity];
  const lower = text.toLowerCase();
  const poolSize = randomPool(random.settings, random.words, level).entries.length;
  const rule = forbiddenPairRule(random.words.pairs);
  // Checked from the list itself, not through randomPool, so a faulty pool cannot vouch for itself.
  const zipf = new Map(random.words.list.entries.map((entry) => [entry.word, entry.zipf]));
  const excluded = new Set(random.words.exclusions.words.map(foldForExclusion));
  const excludedCharacters = characters(random.settings.exclude);
  const cores = tokens.filter(isWordToken).map((token) => token.replace(EDGES, "").toLowerCase());
  for (const core of cores) {
    if (NUMBER.test(core)) {
      check(options.numbers && Number(core) <= level.maxNumber && !(core.length > 1 && core.startsWith("0")), `"${core}" is an allowed number`);
      continue;
    }
    check((zipf.get(core) ?? Number.NEGATIVE_INFINITY) >= level.minZipf, `"${core}" is in the list, at Zipf ${level.minZipf} or more`);
    check(toGraphemes(core).length <= level.maxLetters, `"${core}" has at most ${level.maxLetters} letters`);
    check(!excluded.has(foldForExclusion(core)), `"${core}" is not excluded`);
    check(usesWordLetters(core, language) && ![...core].some((character) => HARD_TO_TYPE_LETTERS.includes(character) || excludedCharacters.includes(character)), `"${core}" uses allowed letters`);
    check(options.accents || /^[a-z']+$/u.test(core), `"${core}" has no diacritic with accents off`);
  }
  check(!characters(random.settings.exclude).some((character) => lower.includes(character)), "no excluded character");
  check(characters(random.settings.include).every((character) => lower.includes(character)), "every included character");
  for (let index = 1; index < cores.length; index += 1) {
    const [left, right] = [cores[index - 1] ?? "", cores[index] ?? ""];
    if (NUMBER.test(left) || NUMBER.test(right)) continue;
    check(poolSize < 2 || foldForExclusion(left) !== foldForExclusion(right), "no word twice in a row");
    check(!rule(left, right), "no forbidden pair side by side");
  }
  check(!options.numbers || cores.some((core) => NUMBER.test(core)), "at least one number with numbers on");
  if (options.punctuation) {
    const used = [...text].filter((character) => MARK_SET.has(character));
    const allowed = new Set<string>(availableMarks(random.settings, level));
    check(used.length > 0, "at least one mark with punctuation on");
    check(used.every((mark) => allowed.has(mark) || (mark === ")" && allowed.has("("))), "marks from the available set only");
  }
  // Every sentence starts with a word (Q-2), capitalised when capitals are on; a terminal mark shows where the next one starts.
  const startsSentence = (index: number): boolean => index === 0 || /[.!?]"?\)?$/u.test(tokens[index - 1] ?? "");
  check(!tokens.some((token, index) => startsSentence(index) && !/^["(]?\p{L}/u.test(token)), "a word at each sentence start");
  if (options.capitals) {
    check(!tokens.some((token, index) => startsSentence(index) && !/^["(]?\p{Lu}/u.test(token)), "a capital at each sentence start");
  }
  return violations;
}

function assertValid(text: string, sources: RaceTextSources, criteria: Readonly<Record<Complexity, ComplexityCriteria>>): void {
  const violations = raceTextViolations(text, sources, criteria);
  if (violations.length > 0) {
    throw new RangeError(`Generated text breaks a guarantee: ${violations.join("; ")}`);
  }
}
