/**
 * The unit of text shared by the server, the bots and the browser: an extended grapheme
 * cluster of the NFC form, what a reader sees as one character. "é" counts once whether it was
 * typed precomposed or as "e" plus a combining accent, and a flag or an emoji sequence counts
 * once. Positions, progress and the Appendix A counts all use this unit.
 *
 * Grapheme rules do not depend on a locale. A browser with an older Unicode version may split a
 * very recent emoji differently; the server stays authoritative, and the corpus has no emoji.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Splits a text into NFC grapheme clusters. An empty text gives an empty list. */
export function toGraphemes(text: string): readonly string[] {
  return Array.from(segmenter.segment(text.normalize("NFC")), (part) => part.segment);
}

/**
 * The NFC form of `input` when it is exactly one grapheme (what one `insert` event must carry,
 * after any input-method composition), otherwise undefined.
 */
export function singleGrapheme(input: string): string | undefined {
  const graphemes = toGraphemes(input);
  return graphemes.length === 1 ? graphemes[0] : undefined;
}
