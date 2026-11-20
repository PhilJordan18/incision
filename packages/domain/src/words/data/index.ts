/**
 * `@incision/domain/words`: the word data for random race texts, server only. Never import it from
 * client code and never re-export it from the package's `index.ts`: every source opens with
 * WORD_DATA_SENTINEL, and tools/word-lists fails the build check when a client asset holds it.
 */
import type { ExclusionList, ForbiddenPairList, TextLanguage, WordList } from "../types";
import { EN_WORDS } from "./en";
import { EN_EXCLUSIONS, FR_EXCLUSIONS } from "./exclusions";
import { parseExclusionSource, parsePairSource, parseWordListSource } from "./format";
import { FR_WORDS } from "./fr";
import { EN_PAIRS, FR_PAIRS } from "./pairs";

export { WORD_DATA_NOTICE } from "./notice";

export const WORD_LISTS: Readonly<Record<TextLanguage, WordList>> = {
  fr: parseWordListSource(FR_WORDS),
  en: parseWordListSource(EN_WORDS),
};

export const EXCLUSIONS: Readonly<Record<TextLanguage, ExclusionList>> = {
  fr: parseExclusionSource(FR_EXCLUSIONS),
  en: parseExclusionSource(EN_EXCLUSIONS),
};

export const FORBIDDEN_PAIRS: Readonly<Record<TextLanguage, ForbiddenPairList>> = {
  fr: parsePairSource(FR_PAIRS),
  en: parsePairSource(EN_PAIRS),
};
