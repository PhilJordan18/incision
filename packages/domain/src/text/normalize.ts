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
 *   so the words on each side stay separate; a hyphen inside a word stays, and the typographic
 *   hyphens ‐ and ‑ between two letters become "-";
 * - French keeps one space before ; : ! ? (none before ":" followed by a digit, as in 10:30) and
 *   English none;
 * - primes, ´ and ` used as apostrophes, and invisible characters are refused with their position,
 *   never removed or converted blindly; so is any character outside the typable set (œ and æ
 *   included, until P-4 sets a rule). Every change made is reported, Unicode composition included.
 */
import type { TextLanguage } from "../words/types";
import { untypableCharacters } from "./typable";

export const NORMALIZATION_VERSION = 1;

export type NormalisationChange = "unicode" | "spaces" | "apostrophes" | "quotes" | "ellipsis" | "dashes" | "hyphens" | "spacing";

export type PassageNormalisation =
  | { readonly ok: true; readonly text: string; readonly changes: readonly NormalisationChange[] }
  | {
      readonly ok: false;
      readonly reason: "EMPTY" | "REFUSED_CHARACTER" | "UNTYPABLE_CHARACTER";
      /** The offending character and its index in code points: in the source for REFUSED, in the normalised text for UNTYPABLE. */
      readonly character: string;
      readonly position: number;
    };

const chars = (...codes: readonly number[]): string => String.fromCodePoint(...codes);

/** Primes, acute and grave accents used as apostrophes, zero-width characters, word joiner, BOM, soft hyphen. */
const REFUSED: ReadonlySet<string> = new Set(chars(0x2032, 0x2033, 0xb4, 0x60, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0xad));
/** No-break, narrow, figure, thin, hair and en-to-six-per-em spaces, tab, and every line break of containsLineBreak. */
const SPECIAL_SPACES = new RegExp(`[${chars(0xa0, 0x202f, 0x2007, 0x2009, 0x200a, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x09, 0x0a, 0x0d, 0x0b, 0x0c, 0x85, 0x2028, 0x2029)}]`, "gu");
const APOSTROPHES = new RegExp(`[${chars(0x2019, 0x2018, 0x2bc)}]`, "gu");
const QUOTES = new RegExp(`[${chars(0x201c, 0x201d, 0x201e)}]`, "gu");
const OPENING_GUILLEMET = new RegExp(`${chars(0xab)} ?`, "gu");
const CLOSING_GUILLEMET = new RegExp(` ?${chars(0xbb)}`, "gu");
const ELLIPSIS = new RegExp(chars(0x2026), "gu");
const DASHES = new RegExp(` ?(?:[${chars(0x2012, 0x2013, 0x2014, 0x2015)}]|-{2,}) ?`, "gu");
const HYPHENS = new RegExp(`(?<=\\p{L})[${chars(0x2010, 0x2011)}](?=\\p{L})`, "gu");

export function normalizePassage(source: string, language: TextLanguage): PassageNormalisation {
  const refused = [...source].findIndex((character) => REFUSED.has(character));
  if (refused !== -1) {
    return { ok: false, reason: "REFUSED_CHARACTER", character: [...source][refused] ?? "", position: refused };
  }
  const changes = new Set<NormalisationChange>();
  let text = source.normalize("NFC");
  if (text !== source) changes.add("unicode");
  const step = (pattern: RegExp, replacement: string, change: NormalisationChange): void => {
    const next = text.replace(pattern, replacement);
    if (next !== text) changes.add(change);
    text = next;
  };
  // Spaces first, so every later pattern meets single spaces only and stays linear.
  step(SPECIAL_SPACES, " ", "spaces");
  step(/ {2,}/gu, " ", "spaces");
  step(/^ | $/gu, "", "spaces");
  step(APOSTROPHES, "'", "apostrophes");
  step(QUOTES, '"', "quotes");
  step(OPENING_GUILLEMET, '"', "quotes");
  step(CLOSING_GUILLEMET, '"', "quotes");
  step(ELLIPSIS, "...", "ellipsis");
  step(DASHES, " - ", "dashes");
  step(HYPHENS, "-", "hyphens");
  step(/^ | $/gu, "", "spaces");
  if (language === "fr") {
    step(/(?<=[^ ;:!?]) ?([;!?])/gu, " $1", "spacing");
    step(/(?<=[^ ;:!?]) ?:(?!\d)/gu, " :", "spacing");
  } else {
    step(/ ([;:!?])/gu, "$1", "spacing");
  }
  if (text === "") {
    return { ok: false, reason: "EMPTY", character: "", position: 0 };
  }
  const [untypable] = untypableCharacters(text, language);
  if (untypable !== undefined) {
    return { ok: false, reason: "UNTYPABLE_CHARACTER", character: untypable, position: [...text].indexOf(untypable) };
  }
  return { ok: true, text, changes: [...changes] };
}
