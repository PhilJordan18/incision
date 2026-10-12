/**
 * The host's text settings (CONF-02 to CONF-07, D-10, D-19) and the checks that need no data.
 * `textSettingsRefusal` runs in the browser as the host configures, and again on the server.
 */
import { TEXT_LANGUAGES, type TextLanguage } from "../words/types";
import { MAX_GRAPHEME_LENGTH, toGraphemes } from "./graphemes";
import { DIGITS, HARD_TO_TYPE_LETTERS, MARKS, WORD_LETTERS, type Mark } from "./typable";

export const TEXT_KINDS = ["coherent", "random"] as const;
export type TextKind = (typeof TEXT_KINDS)[number];

export const COMPLEXITIES = ["easy", "medium", "hard"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];

/** CONF-04 and D-19: a text holds 10 to 200 words. */
export const MIN_TEXT_WORDS = 10;
export const MAX_TEXT_WORDS = 200;

export type TextOptions = {
  readonly punctuation: boolean;
  readonly numbers: boolean;
  readonly capitals: boolean;
  readonly accents: boolean;
};

type BaseTextSettings = {
  readonly language: TextLanguage;
  readonly wordCount: number;
  readonly complexity: Complexity;
  readonly options: TextOptions;
};

/** Coherent mode cannot even express characters to include or exclude (D-10). */
export type CoherentTextSettings = BaseTextSettings & { readonly kind: "coherent" };
export type RandomTextSettings = BaseTextSettings & {
  readonly kind: "random";
  /** Characters that must each appear at least once (Q-5); compared case-insensitively. */
  readonly include: readonly string[];
  /** Characters that must never appear; compared case-insensitively. */
  readonly exclude: readonly string[];
};
export type TextSettings = CoherentTextSettings | RandomTextSettings;

/**
 * What each complexity means for random words (D-10, Q-1, Q-3, Q-4). These are starting values:
 * the thresholds stay parameters until they are calibrated on the real lists (P-1), and
 * `CRITERIA_VERSION` changes with them.
 */
export type ComplexityCriteria = {
  /** Most graphemes in a word, apostrophe included. */
  readonly maxLetters: number;
  /** Least Zipf frequency of a word. */
  readonly minZipf: number;
  /** The marks drawn when punctuation is on; an included mark is added (the host's request wins). */
  readonly marks: readonly Mark[];
  /** Largest number drawn when numbers are on. */
  readonly maxNumber: number;
  /** Tokens per generated sentence, inclusive. */
  readonly sentenceTokens: readonly [min: number, max: number];
};

export const CRITERIA_VERSION = "start-1";

export const COMPLEXITY_CRITERIA: Readonly<Record<Complexity, ComplexityCriteria>> = {
  easy: { maxLetters: 5, minZipf: 4.0, marks: [".", ","], maxNumber: 99, sentenceTokens: [4, 8] },
  medium: { maxLetters: 9, minZipf: 3.3, marks: [".", ",", "?", "!"], maxNumber: 9_999, sentenceTokens: [5, 12] },
  hard: { maxLetters: 16, minZipf: 2.5, marks: [".", ",", "?", "!", ";", ":", '"', "(", ")"], maxNumber: 999_999, sentenceTokens: [6, 16] },
};

/** Refusals that need no data, in priority order (the first match wins). */
export type TextSettingsRefusal =
  | "WORD_COUNT_OUT_OF_RANGE"
  | "UNSUPPORTED_CHARACTER"
  | "CHARACTER_INCLUDED_AND_EXCLUDED"
  | "INCLUDED_CHARACTER_DISABLED"
  | "OPTION_FULLY_EXCLUDED";

const ACCENTED = /[^\u0000-\u007f]/u;
const PAIRED: Readonly<Record<string, string>> = { "(": ")", ")": "(" };

/**
 * Most entries a host may send to include or exclude. The interface offers far fewer; the server's
 * schema caps the arrays first (TECH-07), so a longer one here is a bug.
 */
export const MAX_SETTING_CHARACTERS = 100;

/**
 * A character the host may include or exclude: one letter of the language, a digit or a mark,
 * lowercased. Returns undefined for anything else (two graphemes, a space, "ß" in French, and œ or
 * æ, which random mode avoids for now: P-4).
 */
export function settingCharacter(input: string, language: TextLanguage): string | undefined {
  if (input.length > MAX_GRAPHEME_LENGTH) return undefined;
  const graphemes = toGraphemes(input);
  const character = graphemes.length === 1 ? (graphemes[0] ?? "").toLowerCase() : "";
  const letters = [...WORD_LETTERS[language]].filter((letter) => !HARD_TO_TYPE_LETTERS.includes(letter));
  const supported = [...letters, ...DIGITS, ...MARKS];
  return supported.includes(character) ? character : undefined;
}

/**
 * The marks a random text may use: the complexity's, plus the included ones, minus the excluded
 * ones. Parentheses go as a pair: including one brings the other, excluding one removes both.
 */
export function availableMarks(settings: RandomTextSettings, criteria: ComplexityCriteria): readonly Mark[] {
  const excluded = characterSet(settings.exclude, settings.language);
  const included = [...characterSet(settings.include, settings.language)];
  const wanted = new Set<string>([...criteria.marks, ...included, ...included.flatMap((character) => (character in PAIRED ? [PAIRED[character] ?? ""] : []))]);
  return MARKS.filter((mark) => wanted.has(mark) && !excluded.has(mark) && !(mark in PAIRED && excluded.has(PAIRED[mark] ?? "")));
}

function characterSet(inputs: readonly string[], language: TextLanguage): ReadonlySet<string> {
  return new Set(inputs.map((input) => settingCharacter(input, language)).filter((character): character is string => character !== undefined));
}

/** Throws unless the criteria can drive a bounded generation: only a bug can produce bad ones. */
export function checkCriteria(criteria: Readonly<Record<Complexity, ComplexityCriteria>>): void {
  for (const complexity of COMPLEXITIES) {
    const level = criteria[complexity];
    const [shortest, longest] = level.sentenceTokens;
    const digits = String(level.maxNumber).length;
    if (
      !Number.isInteger(level.maxLetters) || level.maxLetters < 1 || !Number.isFinite(level.minZipf) ||
      // Sentences of two tokens at least leave a gap for every inner mark a host may include.
      !Number.isInteger(shortest) || !Number.isInteger(longest) || shortest < 2 || longest < shortest ||
      level.maxNumber !== 10 ** digits - 1 || !level.marks.every((mark) => (MARKS as readonly string[]).includes(mark)) ||
      level.marks.includes("(") !== level.marks.includes(")")
    ) {
      throw new RangeError(`Invalid complexity criteria for ${complexity}`);
    }
  }
}

/** Settings validity that needs no list and no passage. RangeError for values only a bug can produce. */
export function textSettingsRefusal(settings: TextSettings, criteria: Readonly<Record<Complexity, ComplexityCriteria>> = COMPLEXITY_CRITERIA): TextSettingsRefusal | undefined {
  if (!TEXT_KINDS.includes(settings.kind) || !TEXT_LANGUAGES.includes(settings.language) || !COMPLEXITIES.includes(settings.complexity)) {
    throw new RangeError("Unknown text kind, language or complexity");
  }
  checkCriteria(criteria);
  if (settings.kind === "random" && (settings.include.length > MAX_SETTING_CHARACTERS || settings.exclude.length > MAX_SETTING_CHARACTERS)) {
    throw new RangeError(`At most ${MAX_SETTING_CHARACTERS} characters to include or exclude`);
  }
  if (!Number.isInteger(settings.wordCount) || settings.wordCount < MIN_TEXT_WORDS || settings.wordCount > MAX_TEXT_WORDS) {
    return "WORD_COUNT_OUT_OF_RANGE";
  }
  if (settings.kind === "coherent") {
    return undefined;
  }
  const { language, options } = settings;
  if ([...settings.include, ...settings.exclude].some((input) => settingCharacter(input, language) === undefined)) {
    return "UNSUPPORTED_CHARACTER";
  }
  const include = characterSet(settings.include, language);
  const exclude = characterSet(settings.exclude, language);
  // A parenthesis needs its partner: including one while excluding the other is a contradiction.
  if ([...include].some((character) => exclude.has(character) || (character in PAIRED && exclude.has(PAIRED[character] ?? "")))) {
    return "CHARACTER_INCLUDED_AND_EXCLUDED";
  }
  const isMark = (character: string): boolean => (MARKS as readonly string[]).includes(character);
  if (
    [...include].some(
      (character) => (DIGITS.includes(character) && !options.numbers) || (isMark(character) && !options.punctuation) || (ACCENTED.test(character) && !options.accents),
    )
  ) {
    return "INCLUDED_CHARACTER_DISABLED";
  }
  if (options.numbers && [...DIGITS].every((digit) => exclude.has(digit))) {
    return "OPTION_FULLY_EXCLUDED";
  }
  if (options.punctuation && availableMarks(settings, criteria[settings.complexity]).length === 0) {
    return "OPTION_FULLY_EXCLUDED";
  }
  return undefined;
}
