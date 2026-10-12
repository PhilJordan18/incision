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
import { countWords, cutToWords, tokensOf } from "./words";

/** A passage of the corpus, stored normalised (normalizePassage) with its source elsewhere. */
export type Passage = {
  readonly id: string;
  readonly language: TextLanguage;
  readonly complexity: Complexity;
  readonly text: string;
};

const MARK_SET: ReadonlySet<string> = new Set(MARKS);
const HAS_DIGIT = /\p{N}/u;
const LEADING_OPENERS = /^["(]+/u;
const TRAILING_MARKS = /[.,;:!?)"]+$/u;

/**
 * The host's options applied to a normalised passage, in a fixed order:
 * - numbers off: every token holding a digit goes whole ("1866", "1er"); its trailing marks move
 *   onto the previous token, except a closing mark it opened itself;
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
    tokens = tokens.map((token) => [...token].filter((character) => !MARK_SET.has(character)).join("").replace(/^['-]+|['-]+$/gu, "")).filter((token) => token !== "");
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

function withoutNumbers(tokens: readonly string[]): string[] {
  const kept: string[] = [];
  for (const token of tokens) {
    if (!HAS_DIGIT.test(token)) {
      kept.push(token);
      continue;
    }
    const openers = token.match(LEADING_OPENERS)?.[0] ?? "";
    let trailing = token.match(TRAILING_MARKS)?.[0] ?? "";
    for (const opener of openers) {
      trailing = trailing.replace(opener === "(" ? ")" : '"', "");
    }
    if (trailing !== "" && kept.length > 0) {
      kept[kept.length - 1] += trailing;
    }
  }
  return kept;
}

/** Throws unless each passage is normalised and ids are unique: only a bug can produce one that is not. */
export function checkPassages(passages: readonly Passage[]): void {
  const ids = new Set<string>();
  for (const passage of passages) {
    const normalised = normalizePassage(passage.text, passage.language);
    if (!normalised.ok || normalised.text !== passage.text) {
      throw new RangeError(`Passage ${passage.id} is not a normalised, typable text`);
    }
    if (ids.has(passage.id)) {
      throw new RangeError(`Passage ${passage.id} appears twice`);
    }
    ids.add(passage.id);
  }
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
