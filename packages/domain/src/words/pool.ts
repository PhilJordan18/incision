import type { ExclusionList, ForbiddenPairList, WordEntry, WordList, WordPool } from "./types";

/**
 * The form two words are compared in for exclusions and forbidden pairs: accents dropped, œ and æ
 * spelled out, the typographic apostrophe made straight, lowercase. So "Connard", a decomposed
 * "é" or "œ" never slip past a list written another way. Exact forms only: excluding "con" never
 * removes "conte".
 */
export function foldForExclusion(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’ʼ]/g, "'")
    .normalize("NFC");
}

/**
 * The words a random text may draw from: the list minus its exclusions, applied first and always,
 * then the optional `accept` filter (a complexity level, letters without accents…). The pool may be
 * empty; the text generator refuses that case before drawing (F-02.5).
 */
export function buildWordPool(input: {
  readonly list: WordList;
  readonly exclusions: ExclusionList;
  readonly accept?: (entry: WordEntry) => boolean;
}): WordPool {
  const { list, exclusions, accept } = input;
  if (list.language !== exclusions.language) {
    throw new RangeError(`Exclusions in ${exclusions.language} cannot filter a list in ${list.language}`);
  }
  const excluded = new Set(exclusions.words.map(foldForExclusion));
  const allowed = list.entries.filter((entry) => !excluded.has(foldForExclusion(entry.word)));
  const pool: Omit<WordPool, "__brand"> = {
    language: list.language,
    listVersion: list.version,
    exclusionsVersion: exclusions.version,
    entries: accept === undefined ? allowed : allowed.filter(accept),
  };
  // The only constructor of a WordPool: the exclusions above always ran first.
  return pool as WordPool;
}

/** Whether two words may not follow each other in a random text, in either order. */
export type ForbiddenPairRule = (first: string, second: string) => boolean;

/** The rule for a pair list, matched on folded forms; the generator applies it (F-02.5). */
export function forbiddenPairRule(list: ForbiddenPairList): ForbiddenPairRule {
  const key = (first: string, second: string): string => {
    const [low, high] = [foldForExclusion(first), foldForExclusion(second)].sort();
    return `${low}\u0000${high}`;
  };
  const forbidden = new Set(list.pairs.map(([first, second]) => key(first, second)));
  return (first, second) => forbidden.has(key(first, second));
}
