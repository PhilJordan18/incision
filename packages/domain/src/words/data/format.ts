/**
 * The text format of the word data, server-only (subpath `@incision/domain/words`, never
 * `index.ts`). Each list is one template literal whose first line starts with WORD_DATA_SENTINEL, so
 * no bundler can keep the words and drop the marker: the client-bundle check (tools/word-lists)
 * finds the sentinel wherever a list leaks.
 *
 *   incision-word-lists-data-v1 <kind> <language> <version>
 *   words:      one line per Zipf bin, "<zipf × 100> <word> <word>…", Zipf descending
 *   exclusions: one word per line
 *   pairs:      "<word> <word>" per line
 */
import { usesWordLetters } from "../../text/typable";
import { foldForExclusion } from "../pool";
import { TEXT_LANGUAGES, type ExclusionList, type ForbiddenPairList, type TextLanguage, type WordEntry, type WordList } from "../types";

/** Opens every data source; written nowhere outside src/words/data/. Keep in step with tools/word-lists. */
export const WORD_DATA_SENTINEL = "incision-word-lists-data-v1";

type Kind = "words" | "exclusions" | "pairs";

/** Lowercase letters, with at most an apostrophe between two letters ("aujourd'hui"); NFKC-stable, so NFC too. The language's own alphabet is checked too. */
const WORD = /^\p{Ll}+(?:'\p{Ll}+)*$/u;
const VERSION = /^[a-z0-9][a-z0-9.-]{0,31}$/;

function checkedWord(word: string, language: TextLanguage, where: string): string {
  // NFKC also refuses ligatures ("ﬁ") and fullwidth letters, which no keyboard types as one key.
  if (!WORD.test(word) || word.normalize("NFKC") !== word) {
    throw new RangeError(`${where}: "${word}" is not an NFKC lowercase word`);
  }
  // An explicit alphabet: a lookalike from another script ("idiоt" with a Cyrillic о) is refused.
  if (!usesWordLetters(word, language)) {
    throw new RangeError(`${where}: "${word}" uses a letter outside the ${language} alphabet`);
  }
  return word;
}

function header(source: string, kind: Kind): { readonly language: TextLanguage; readonly version: string; readonly lines: readonly string[] } {
  if (source.includes("\r")) {
    throw new RangeError(`A ${kind} source must use LF line endings, without CR`);
  }
  const [first = "", ...lines] = source.split("\n");
  const [sentinel, foundKind, language, version, ...rest] = first.split(" ");
  if (sentinel !== WORD_DATA_SENTINEL || foundKind !== kind || rest.length > 0) {
    throw new RangeError(`A ${kind} source must open with "${WORD_DATA_SENTINEL} ${kind} <language> <version>"`);
  }
  if (!TEXT_LANGUAGES.some((candidate) => candidate === language)) {
    throw new RangeError(`Unknown language "${language}" in a ${kind} source`);
  }
  if (version === undefined || !VERSION.test(version)) {
    throw new RangeError(`Invalid version "${version}" in a ${kind} source`);
  }
  return { language: language as TextLanguage, version, lines: lines.filter((line) => line !== "") };
}

export function parseWordListSource(source: string): WordList {
  const { language, version, lines } = header(source, "words");
  const entries: WordEntry[] = [];
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const [bin = "", ...words] = line.split(" ");
    const centiZipf = Number(bin);
    if (!/^(?:0|[1-9]\d{0,2})$/.test(bin) || centiZipf > 900 || centiZipf >= previous || words.length === 0) {
      throw new RangeError(`words ${language}: bin "${bin}" must be an integer Zipf × 100 up to 900, strictly descending, with words`);
    }
    previous = centiZipf;
    for (const word of words) {
      if (seen.has(checkedWord(word, language, `words ${language}`))) {
        throw new RangeError(`words ${language}: "${word}" appears twice`);
      }
      seen.add(word);
      entries.push({ word, zipf: centiZipf / 100 });
    }
  }
  // Frozen: the engine caches per list object (folded forms, Zipf), which a change in place would make stale.
  return Object.freeze({ language, version, entries: Object.freeze(entries.map((entry) => Object.freeze(entry))) });
}

export function parseExclusionSource(source: string): ExclusionList {
  const { language, version, lines } = header(source, "exclusions");
  return Object.freeze({ language, version, words: Object.freeze(lines.map((line) => checkedWord(line, language, `exclusions ${language}`))) });
}

export function parsePairSource(source: string): ForbiddenPairList {
  const { language, version, lines } = header(source, "pairs");
  const pairs = lines.map((line): readonly [string, string] => {
    const words = line.split(" ");
    // Folded like the rule matches them: "cote côte" would forbid "cote cote".
    if (words.length !== 2 || foldForExclusion(words[0] ?? "") === foldForExclusion(words[1] ?? "")) {
      throw new RangeError(`pairs ${language}: "${line}" is not two different words`);
    }
    return [checkedWord(words[0] ?? "", language, `pairs ${language}`), checkedWord(words[1] ?? "", language, `pairs ${language}`)];
  });
  return Object.freeze({ language, version, pairs: Object.freeze(pairs.map((pair) => Object.freeze(pair))) });
}
