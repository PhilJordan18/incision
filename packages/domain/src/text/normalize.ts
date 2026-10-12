/**
 * Passage normalisation, version 1 (Q-0, Q-10, decisions of October 12): the typographic
 * adaptations that make a literary passage typable, never a rewrite. The source text is stored
 * next to the result, with NORMALIZATION_VERSION. Dictionary words follow another path
 * (src/words: an explicit alphabet, then folding for exclusions); this file is for passages only.
 *
 * - special spaces, tabs and line breaks become one space; runs collapse; ends are trimmed;
 * - ’ ‘ ʼ become ' and “ ” „ become "; « and » become ", attached to the quoted words;
 * - … becomes three dots;
 * - a sentence dash (— – ‒ ―, or "--" as Gutenberg writes it) becomes "-" between two spaces,
 *   so the words on each side stay separate; a hyphen inside a word stays;
 * - French keeps one space before ; : ! ? and English none;
 * - primes, ´ and ` used as apostrophes, and invisible characters are refused with their position,
 *   never removed or converted blindly; so is any character outside the typable set (œ and æ
 *   included, until P-4 sets a rule).
 */
import type { TextLanguage } from "../words/types";
import { untypableCharacters } from "./typable";

export const NORMALIZATION_VERSION = 1;

export type NormalisationChange = "spaces" | "apostrophes" | "quotes" | "ellipsis" | "dashes" | "spacing";

export type PassageNormalisation =
  | { readonly ok: true; readonly text: string; readonly changes: readonly NormalisationChange[] }
  | {
      readonly ok: false;
      readonly reason: "EMPTY" | "REFUSED_CHARACTER" | "UNTYPABLE_CHARACTER";
      /** The offending character and its index in code points: in the source for REFUSED, in the normalised text for UNTYPABLE. */
      readonly character: string;
      readonly position: number;
    };

const REFUSED = /[\u2032\u2033\u00b4`\u200b\u200c\u200d\u2060\ufeff\u00ad]/u;
const SPACES = /[\u00a0\u202f\u2007\u2009\u200a\u2002-\u2006\t\n\r\v\f\u0085\u2028\u2029 ]+/gu;

export function normalizePassage(source: string, language: TextLanguage): PassageNormalisation {
  const refused = [...source].findIndex((character) => REFUSED.test(character));
  if (refused !== -1) {
    return { ok: false, reason: "REFUSED_CHARACTER", character: [...source][refused] ?? "", position: refused };
  }
  const changes = new Set<NormalisationChange>();
  const step = (text: string, pattern: RegExp, replacement: string, change: NormalisationChange): string => {
    const next = text.replace(pattern, replacement);
    if (next !== text) changes.add(change);
    return next;
  };
  let text = source.normalize("NFC");
  text = step(text, /[\u00a0\u202f\u2007\u2009\u200a\u2002-\u2006\t\n\r\v\f\u0085\u2028\u2029]/gu, " ", "spaces");
  text = step(text, /[’‘ʼ]/gu, "'", "apostrophes");
  text = step(text, /[“”„]/gu, '"', "quotes");
  text = step(text, /« */gu, '"', "quotes");
  text = step(text, / *»/gu, '"', "quotes");
  text = step(text, /…/gu, "...", "ellipsis");
  text = step(text, / *(?:[\u2012\u2013\u2014\u2015]|-{2,}) */gu, " - ", "dashes");
  text = text.replace(SPACES, " ").trim();
  text = language === "fr"
    ? step(text, /([\p{L}\p{N}")]) ?([;:!?])/gu, "$1 $2", "spacing")
    : step(text, /([\p{L}\p{N}")]) ([;:!?])/gu, "$1$2", "spacing");
  text = text.normalize("NFC");
  if (text === "") {
    return { ok: false, reason: "EMPTY", character: "", position: 0 };
  }
  const [untypable] = untypableCharacters(text, language);
  if (untypable !== undefined) {
    return { ok: false, reason: "UNTYPABLE_CHARACTER", character: untypable, position: [...text].indexOf(untypable) };
  }
  return { ok: true, text, changes: [...changes] };
}
