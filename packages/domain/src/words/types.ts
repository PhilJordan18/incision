/**
 * Word lists for random race texts (F-02.4). The lists themselves are data, served only by the
 * server-only subpath `@incision/domain/words`; this file and the pool functions are the contract.
 */

/** Languages of a race text (CONF-02); the interface's locales (apps/web) use the same codes. */
export const TEXT_LANGUAGES = ["fr", "en"] as const;
export type TextLanguage = (typeof TEXT_LANGUAGES)[number];

/** One word of a frequency list: NFC and lowercase, with its Zipf frequency to two decimals. */
export type WordEntry = { readonly word: string; readonly zipf: number };

/** A frequency list: unique words in descending Zipf order. */
export type WordList = {
  readonly language: TextLanguage;
  readonly version: string;
  readonly entries: readonly WordEntry[];
};

/** Words never drawn at random in this language (P-2). Matched on folded exact forms, never substrings. */
export type ExclusionList = {
  readonly language: TextLanguage;
  readonly version: string;
  readonly words: readonly string[];
};

/**
 * Pairs of words that must never follow each other in a random text, in either order (P-2,
 * option c). Each word stays drawable alone; only the adjacency is forbidden.
 */
export type ForbiddenPairList = {
  readonly language: TextLanguage;
  readonly version: string;
  readonly pairs: readonly (readonly [string, string])[];
};

/** Built only by `buildWordPool`, so the exclusions always come before any other filter and any draw. */
export type WordPool = {
  readonly language: TextLanguage;
  readonly listVersion: string;
  readonly exclusionsVersion: string;
  readonly entries: readonly WordEntry[];
} & { readonly __brand: "WordPool" };
