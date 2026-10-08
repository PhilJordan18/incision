/**
 * The unit of text shared by the server, the bots and the browser: an extended grapheme
 * cluster of the NFC form, what a reader sees as one character. "é" counts once whether it was
 * typed precomposed or as "e" plus a combining accent, and a flag or an emoji sequence counts
 * once. Positions, progress and the Appendix A counts all use this unit.
 *
 * Grapheme rules do not depend on a locale. A browser with an older Unicode version, or without
 * `Intl.Segmenter`, may split a very recent emoji or a rare cluster differently; the server stays
 * authoritative, and the corpus has no emoji.
 */

/** Longest single grapheme accepted from a keyboard, in UTF-16 code units (the longest emoji sequences fit). */
export const MAX_GRAPHEME_LENGTH = 16;

let segmenter: Intl.Segmenter | undefined;

/** Splits a text into NFC grapheme clusters. An empty text gives an empty list. */
export function toGraphemes(text: string): readonly string[] {
  const normalized = text.normalize("NFC");
  if (typeof Intl.Segmenter !== "function") {
    // Older browsers: code points of the NFC form, close enough for live feedback.
    return Array.from(normalized);
  }
  // Created on first use, so importing the package never fails where the API is missing.
  segmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
  return Array.from(segmenter.segment(normalized), (part) => part.segment);
}

/**
 * The NFC form of `input` when it is exactly one grapheme of at most `MAX_GRAPHEME_LENGTH` code
 * units (what one `insert` event must carry, after any input-method composition), otherwise
 * undefined.
 */
export function singleGrapheme(input: string): string | undefined {
  if (input.length === 0 || input.length > MAX_GRAPHEME_LENGTH) {
    return undefined;
  }
  const graphemes = toGraphemes(input);
  return graphemes.length === 1 ? graphemes[0] : undefined;
}
