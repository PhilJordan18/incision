/**
 * Counting words in a race text (D-10, Q-3): a word is a token between spaces that holds at
 * least one letter or digit. A token of punctuation only (a French "?", a dash " - ") is no word.
 */

const IS_WORD = /[\p{L}\p{N}]/u;

/** The tokens of a normalised text, split on single spaces. */
export function tokensOf(text: string): readonly string[] {
  return text === "" ? [] : text.split(" ");
}

export const isWordToken = (token: string): boolean => IS_WORD.test(token);

export function countWords(text: string): number {
  return tokensOf(text).filter(isWordToken).length;
}

/** Punctuation that closes what comes before it; a dash or an opening mark starts what follows. */
const CLOSING = /^[.,;:!?)]+$/u;

/**
 * The text cut after its `count`th word, keeping the closing punctuation tokens that directly
 * follow it ("… mers ;" stays whole). A cut never ends on a lone dash or an opening mark.
 * RangeError when the text has fewer words.
 */
export function cutToWords(text: string, count: number): string {
  const kept: string[] = [];
  let words = 0;
  for (const token of tokensOf(text)) {
    if (isWordToken(token)) {
      if (words === count) break;
      words += 1;
    } else if (words === count && !CLOSING.test(token)) {
      break;
    }
    kept.push(token);
  }
  if (words < count) {
    throw new RangeError(`The text has ${words} words, fewer than ${count}`);
  }
  return kept.join(" ");
}
