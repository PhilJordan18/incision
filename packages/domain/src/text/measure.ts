/**
 * Difficulty measures of a passage (D-10, addendum 2.3). These are measurements only: the
 * editorial appraisal (theme, register, suitability for 12–17 year olds) is a separate judgement,
 * recorded with the corpus, never computed here. The thresholds that turn measures into a level
 * are parameters until they are calibrated (P-1).
 */
import type { WordList } from "../words/types";
import type { Complexity } from "./settings";
import { isWordToken, tokensOf } from "./words";

/** A passage is measured on its first 200 words at most: no word after the 200th is ever typed. */
export const MEASURED_WORDS = 200;

export type TextMeasures = {
  readonly words: number;
  readonly measuredWords: number;
  /** M1: mean letters per word holding letters (numbers aside). */
  readonly meanLetters: number;
  /** M2: percentage of those words longer than 9 letters. */
  readonly longWordShare: number;
  /** M3: percentage of words outside common vocabulary (Zipf below `commonZipf`, or absent), proper nouns aside. */
  readonly rareWordShare: number;
  /** M4: special characters per 100 words: marks other than . and ,, digits, apostrophes and hyphens. */
  readonly specialPer100Words: number;
  /** The lowercase words the list does not know, for review. */
  readonly unknownWords: readonly string[];
};

const LETTER = /\p{L}/gu;
const SPECIAL = /[;:!?"()\d'-]/gu;
const LEADING_MARKS = /^[^\p{L}\p{N}]+/u;
const TRAILING_MARKS = /(?<=[\p{L}\p{N}])[^\p{L}\p{N}]+$/u;
const TERMINAL_END = /[.!?]["')]*$/u;

export function measureText(text: string, list: WordList, commonZipf: number): TextMeasures {
  const zipf = new Map(list.entries.map((entry) => [entry.word, entry.zipf]));
  const tokens = tokensOf(text);
  const words = tokens.filter(isWordToken).length;
  const measured = cutTokens(tokens, Math.min(words, MEASURED_WORDS));
  let n = 0;
  let lettered = 0;
  let letters = 0;
  let long = 0;
  let considered = 0;
  let rare = 0;
  let special = 0;
  const unknown = new Set<string>();
  let sentenceStart = true;
  for (const token of measured) {
    special += token.match(SPECIAL)?.length ?? 0;
    if (!isWordToken(token)) {
      // A lone dash or mark between two sentences does not end the sentence before it.
      sentenceStart ||= TERMINAL_END.test(token);
      continue;
    }
    n += 1;
    const core = token.replace(LEADING_MARKS, "").replace(TRAILING_MARKS, "");
    const count = core.match(LETTER)?.length ?? 0;
    if (count > 0) {
      lettered += 1;
      letters += count;
      long += count > 9 ? 1 : 0;
      // A capital away from a sentence start marks a proper noun (English "I" aside), which leaves the vocabulary measure.
      if (!(/^\p{Lu}/u.test(core) && !sentenceStart && core !== "I")) {
        considered += 1;
        // Elisions are looked up the way wordfreq splits them ("l'eau" as "eau"); hyphenated words part by
        // part, without one-letter parts such as the euphonic t of "va-t-il".
        const parts = core.toLowerCase().split("-").filter((part) => part.length > 1 || (part !== "" && !core.includes("-"))).map((part) => (zipf.has(part) || !part.includes("'") ? part : part.slice(part.lastIndexOf("'") + 1)));
        rare += parts.some((part) => (zipf.get(part) ?? Number.NEGATIVE_INFINITY) < commonZipf) ? 1 : 0;
        parts.filter((part) => !zipf.has(part)).forEach((part) => unknown.add(part));
      }
    }
    sentenceStart = TERMINAL_END.test(token);
  }
  const percent = (part: number, whole: number): number => (whole === 0 ? 0 : (100 * part) / whole);
  return {
    words,
    measuredWords: n,
    meanLetters: lettered === 0 ? 0 : letters / lettered,
    longWordShare: percent(long, lettered),
    rareWordShare: percent(rare, considered),
    specialPer100Words: percent(special, n),
    unknownWords: [...unknown],
  };
}

function cutTokens(tokens: readonly string[], words: number): readonly string[] {
  const kept: string[] = [];
  let seen = 0;
  for (const token of tokens) {
    if (isWordToken(token)) {
      if (seen === words) break;
      seen += 1;
    }
    kept.push(token);
  }
  return kept;
}

/** The thresholds a to f of the classification rule (addendum 2.3); undecided until calibration (P-1). */
export type PassageThresholds = {
  readonly easyMaxMeanLetters: number;
  readonly easyMaxRareShare: number;
  readonly easyMaxSpecialPer100: number;
  readonly hardMinMeanLetters: number;
  readonly hardMinRareShare: number;
  readonly hardMinLongShare: number;
};

/** easy when M1, M3 and M4 are all low; hard when M1 or M3 or M2 is high; medium otherwise. */
export function classifyMeasures(measures: TextMeasures, thresholds: PassageThresholds): Complexity {
  if (
    measures.meanLetters >= thresholds.hardMinMeanLetters ||
    measures.rareWordShare >= thresholds.hardMinRareShare ||
    measures.longWordShare >= thresholds.hardMinLongShare
  ) {
    return "hard";
  }
  if (
    measures.meanLetters <= thresholds.easyMaxMeanLetters &&
    measures.rareWordShare <= thresholds.easyMaxRareShare &&
    measures.specialPer100Words <= thresholds.easyMaxSpecialPer100
  ) {
    return "easy";
  }
  return "medium";
}
