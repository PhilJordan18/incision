/**
 * Coherent mode (D-10, D-21, Q-6, Q-12): a real passage, transformed by the host's options, then
 * cut after its Nth word from its start. Nothing is invented and no distant passages are joined;
 * the options only remove or change characters, before the cut.
 */
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import type { TextLanguage } from "../words/types";
import { toGraphemes } from "./graphemes";
import { normalizePassage } from "./normalize";
import type { CoherentTextSettings, Complexity, TextOptions } from "./settings";
import { MARKS } from "./typable";
import { countWords, cutToWords, isWordToken, tokensOf } from "./words";

/** A passage of the corpus, stored normalised (normalizePassage) with its source elsewhere. */
export type Passage = {
  readonly id: string;
  readonly language: TextLanguage;
  readonly complexity: Complexity;
  readonly text: string;
};

/**
 * Longest stored passage, in UTF-16 code units. Only its first 200 words are ever typed, so a longer
 * one is a corpus bug; the bound also caps the work every coherent call does on each passage.
 */
export const MAX_PASSAGE_LENGTH = 2 * MAX_TEXT_GRAPHEMES;

const MARK_SET: ReadonlySet<string> = new Set(MARKS);
const HAS_DIGIT = /\p{N}/u;
const LEADING_OPENERS = /^["(]+/u;
// The lookbehinds keep these linear: a run of marks is scanned once, from its start only.
const TRAILING_MARKS = /(?<![.,;:!?)"])[.,;:!?)"]+$/u;

/**
 * The host's options applied to a normalised passage, in a fixed order:
 * - numbers off: every token holding a digit goes whole ("1866", "1er"); its closing and end marks
 *   move onto the previous word (an end mark only if that word has none yet), and a quote or
 *   parenthesis it opened moves onto the next word, so marks stay balanced;
 * - punctuation off: every mark goes, and a dash token with it; apostrophes and hyphens inside a
 *   word stay (they are spelling);
 * - capitals off: lowercase; on keeps the source case;
 * - accents off: diacritics stripped (the only possibility in a real text), œ and æ spelled out.
 */
export function applyPassageOptions(text: string, options: TextOptions): string {
  let tokens = [...tokensOf(text)];
  if (!options.numbers) {
    tokens = withoutNumbers(tokens);
  }
  if (!options.punctuation) {
    tokens = tokens.map((token) => [...token].filter((character) => !MARK_SET.has(character)).join("").replace(/^['-]+|(?<!['-])['-]+$/gu, "")).filter((token) => token !== "");
  }
  let result = tokens.join(" ");
  if (!options.capitals) {
    result = result.toLowerCase();
  }
  if (!options.accents) {
    result = result.normalize("NFD").replace(/\p{M}/gu, "").replace(/œ/gu, "oe").replace(/Œ/gu, "OE").replace(/æ/gu, "ae").replace(/Æ/gu, "AE").normalize("NFC");
  }
  return result;
}

const CLOSER: Readonly<Record<string, string>> = { "(": ")", '"': '"' };

/**
 * Whether a run of numbers goes on from `token` to the number `next`: "1 000", "1914 - 1918" and
 * "1, 2, 3" are one run. A run never crosses a quote or a parenthesis, which would leave its partner
 * alone, nor a mark other than a comma, which would join two sentences.
 */
const runContinues = (token: string, next: string | undefined): boolean =>
  next !== undefined && HAS_DIGIT.test(next) && !LEADING_OPENERS.test(next) && /^,?$/u.test(token.match(TRAILING_MARKS)?.[0] ?? "");

/** Whether a kept token already ends with a mark, closing quotes and parentheses aside. */
const endsWithMark = (token: string | undefined): boolean => token !== undefined && /[.,;:!?]$/u.test(token.replace(/(?<![)"])[)"]+$/u, ""));

/**
 * Removes number tokens. A run of numbers ("1914 - 1918", "1 000") goes as one unit; marks it opens
 * and closes go with it; a closer it opened that sits in the next punctuation token goes too. Its
 * other closing and end marks move onto the previous word, an end mark only when the last token
 * other than a dash has none yet; a mark standing alone after it (French "1918 !") follows the same
 * rule. A dash left with nothing on one side goes: at the start, at the end, or as the second dash
 * of an emptied pair.
 */
function withoutNumbers(tokens: readonly string[]): string[] {
  const source = [...tokens];
  const kept: string[] = [];
  // The last kept word, and the last kept token other than a dash, kept up to date so each number
  // run finds them at once. An end mark after a removed number is weighed against the second one.
  let lastWord = -1;
  let lastSolid = -1;
  let pendingOpeners = "";
  let index = 0;
  while (index < source.length) {
    const token = source[index] ?? "";
    if (!HAS_DIGIT.test(token)) {
      if (token !== "") kept.push(isWordToken(token) ? pendingOpeners + token : token);
      if (token !== "" && token !== "-") lastSolid = kept.length - 1;
      if (isWordToken(token)) {
        pendingOpeners = "";
        lastWord = kept.length - 1;
      }
      index += 1;
      continue;
    }
    let end = index;
    while (true) {
      const current = source[end] ?? "";
      if (runContinues(current, source[end + 1])) end += 1;
      else if (source[end + 1] === "-" && runContinues(current, source[end + 2])) end += 2;
      else break;
    }
    let openers = source[index]?.match(LEADING_OPENERS)?.[0] ?? "";
    let trailing = source[end]?.match(TRAILING_MARKS)?.[0] ?? "";
    for (const opener of [...openers]) {
      const closer = CLOSER[opener] ?? "";
      if (trailing.includes(closer)) {
        trailing = trailing.replace(closer, "");
        openers = openers.replace(opener, "");
      }
    }
    const next = source[end + 1];
    if (openers !== "" && next !== undefined && !isWordToken(next)) {
      let rest = next;
      for (const opener of [...openers]) {
        const closer = CLOSER[opener] ?? "";
        if (rest.includes(closer)) {
          rest = rest.replace(closer, "");
          openers = openers.replace(opener, "");
        }
      }
      source[end + 1] = rest;
    }
    pendingOpeners += openers;
    const previous = lastWord;
    const before = kept[lastSolid];
    if (trailing !== "" && previous !== -1) {
      const word = kept[previous] ?? "";
      const closers = trailing.replace(/[^)"]/gu, "");
      const ends = endsWithMark(word) || endsWithMark(before) ? "" : trailing.replace(/[)"]/gu, "");
      kept[previous] = word + ends + closers;
    }
    let after = end + 1;
    for (; /^[.,;:!?]+$/u.test(source[after] ?? ""); after += 1) {
      // Read again: the run's own end mark may just have been added there.
      const last = kept[lastSolid];
      if (last === undefined || endsWithMark(last)) source[after] = "";
    }
    // A dash now between nothing and something goes: at the start, at the end, or doubled.
    if (source[after] === "-" && (kept.length === 0 || kept.at(-1) === "-")) {
      source[after] = "";
      if (kept.at(-1) === "-") kept.pop();
    } else if (source[after] === undefined && kept.at(-1) === "-") {
      kept.pop();
    }
    index = end + 1;
  }
  return kept;
}

/** Corpora already checked. Only frozen ones are remembered: a corpus that can change is checked again. */
const CHECKED = new WeakSet<readonly Passage[]>();

/**
 * Throws unless each passage is normalised and ids are unique: only a bug can produce one that is
 * not. A frozen corpus of frozen passages is checked once.
 */
export function checkPassages(passages: readonly Passage[]): void {
  if (CHECKED.has(passages)) return;
  const ids = new Set<string>();
  for (const passage of passages) {
    if (passage.text.length > MAX_PASSAGE_LENGTH) {
      throw new RangeError(`Passage ${passage.id} is longer than MAX_PASSAGE_LENGTH`);
    }
    const normalised = normalizePassage(passage.text, passage.language);
    if (!normalised.ok || normalised.text !== passage.text) {
      throw new RangeError(`Passage ${passage.id} is not a normalised, typable text`);
    }
    if (ids.has(passage.id)) {
      throw new RangeError(`Passage ${passage.id} appears twice`);
    }
    ids.add(passage.id);
  }
  if (Object.isFrozen(passages) && passages.every((passage) => Object.isFrozen(passage))) CHECKED.add(passages);
}

/** The passage's text for these settings, cut to N words, or undefined when it cannot serve them. */
export function passageCut(passage: Passage, settings: CoherentTextSettings): string | undefined {
  if (passage.language !== settings.language || passage.complexity !== settings.complexity) {
    return undefined;
  }
  const transformed = applyPassageOptions(passage.text, settings.options);
  if (countWords(transformed) < settings.wordCount) {
    return undefined;
  }
  const cut = cutToWords(transformed, settings.wordCount);
  return toGraphemes(cut).length <= MAX_TEXT_GRAPHEMES && tokensOf(cut).length > 0 ? cut : undefined;
}
