/**
 * The characters of race texts, per language (Q-0, Q-10). Dictionary words use an explicit
 * alphabet, so a lookalike from another script ("о" Cyrillic) can never pass for a Latin letter;
 * typed texts use the typable set. A character outside it is refused at import or is a bug at
 * generation: it is never changed silently.
 */
import type { TextLanguage } from "../words/types";

/** The lowercase letters of each language's dictionary words, apostrophe aside. */
export const WORD_LETTERS: Readonly<Record<TextLanguage, string>> = {
  fr: "abcdefghijklmnopqrstuvwxyzàâäçéèêëîïôöùûüÿœæ",
  en: "abcdefghijklmnopqrstuvwxyz",
};

/**
 * Correct French letters that need more than one key on the class's keyboards (P-4). Passages spell
 * them out, a typographic adaptation (normalisation version 2). Random mode avoids the words holding
 * them in this version: a dictionary word is never respelled "oe" or "ae".
 */
export const HARD_TO_TYPE_LETTERS = "œæ";

export const DIGITS = "0123456789";

/** Every punctuation mark a text may hold. The apostrophe and the hyphen inside a word are spelling. */
export const MARKS = [".", ",", "?", "!", ";", ":", '"', "(", ")"] as const;
export type Mark = (typeof MARKS)[number];

const TYPABLE: Readonly<Record<TextLanguage, ReadonlySet<string>>> = {
  fr: typableSet("fr"),
  en: typableSet("en"),
};

function typableSet(language: TextLanguage): ReadonlySet<string> {
  const letters = [...WORD_LETTERS[language]].filter((letter) => !HARD_TO_TYPE_LETTERS.includes(letter));
  return new Set([...letters, ...letters.map((letter) => letter.toUpperCase()), ...DIGITS, ...MARKS, " ", "'", "-"]);
}

/** The distinct characters of `text` outside the language's typable set, in order of appearance. */
export function untypableCharacters(text: string, language: TextLanguage): readonly string[] {
  return [...new Set([...text].filter((character) => !TYPABLE[language].has(character)))];
}

/** Whether a lowercase dictionary word uses only its language's letters, with apostrophes inside. */
export function usesWordLetters(word: string, language: TextLanguage): boolean {
  return [...word].every((character) => character === "'" || WORD_LETTERS[language].includes(character));
}
