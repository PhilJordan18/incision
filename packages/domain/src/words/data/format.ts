/**
 * The text format of the word data, server-only (subpath `@incision/domain/words`, never
 * `index.ts`). Each list is one string literal whose first line starts with WORD_DATA_SENTINEL, so
 * no bundler can keep the words and drop the marker: the client-bundle check (tools/word-lists)
 * finds the sentinel wherever a list leaks.
 *
 *   incision-word-lists-data-v1 <kind> <language> <version>
 *   words:      one line per Zipf bin, "<zipf × 100> <word> <word>…", Zipf descending
 *   exclusions: one word per line
 *   pairs:      "<word> <word>" per line
 */
import { TEXT_LANGUAGES, type ExclusionList, type ForbiddenPairList, type TextLanguage, type WordEntry, type WordList } from "../types";

/** Opens every data source; written nowhere else in the engine. Keep in step with tools/word-lists. */
export const WORD_DATA_SENTINEL = "incision-word-lists-data-v1";

type Kind = "words" | "exclusions" | "pairs";

/** NFC, lowercase letters, with at most an apostrophe between two letters ("aujourd'hui"). */
const WORD = /^\p{Ll}+(?:'\p{Ll}+)*$/u;
const VERSION = /^[a-z0-9][a-z0-9.-]{0,31}$/;

function checkedWord(word: string, where: string): string {
  if (!WORD.test(word) || word.normalize("NFC") !== word) {
    throw new RangeError(`${where}: "${word}" is not an NFC lowercase word`);
  }
  return word;
}

function header(source: string, kind: Kind): { readonly language: TextLanguage; readonly version: string; readonly lines: readonly string[] } {
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
    if (!/^\d{1,3}$/.test(bin) || centiZipf > 900 || centiZipf >= previous || words.length === 0) {
      throw new RangeError(`words ${language}: bin "${bin}" must be an integer Zipf × 100 up to 900, strictly descending, with words`);
    }
    previous = centiZipf;
    for (const word of words) {
      if (seen.has(checkedWord(word, `words ${language}`))) {
        throw new RangeError(`words ${language}: "${word}" appears twice`);
      }
      seen.add(word);
      entries.push({ word, zipf: centiZipf / 100 });
    }
  }
  return { language, version, entries };
}

export function parseExclusionSource(source: string): ExclusionList {
  const { language, version, lines } = header(source, "exclusions");
  return { language, version, words: lines.map((line) => checkedWord(line, `exclusions ${language}`)) };
}

export function parsePairSource(source: string): ForbiddenPairList {
  const { language, version, lines } = header(source, "pairs");
  const pairs = lines.map((line): readonly [string, string] => {
    const words = line.split(" ");
    if (words.length !== 2 || words[0] === words[1]) {
      throw new RangeError(`pairs ${language}: "${line}" is not two different words`);
    }
    return [checkedWord(words[0] ?? "", `pairs ${language}`), checkedWord(words[1] ?? "", `pairs ${language}`)];
  });
  return { language, version, pairs };
}
