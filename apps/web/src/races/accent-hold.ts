/**
 * The OS accent menu (macOS press-and-hold): the held letter is kept provisionally in the typing
 * field, the OS selects it and replaces it with the accent chosen. Only that replacement is
 * accepted; pasting, dropping and any other replacement stay refused (screen 08).
 */

/**
 * Letters held for an accent: those with accented forms in the race texts (à â ç é è ê ë î ï ô ù
 * û ü ÿ), in both cases. Any other key is sent at once, as before.
 */
const HELD_LETTERS = new Set([..."aceiouyACEIOUY"]);

export function holdsAccents(key: string): boolean {
  return HELD_LETTERS.has(key);
}

const COMBINING_MARKS = /^\p{M}+$/u;

/**
 * One grapheme that is the held letter, in the same case, with diacritics only: i gives î, ï, ì, í,
 * I gives Î, Ï, Ì, Í. Returns the composed (NFC) form to type, or undefined for anything else:
 * another letter, the other case, the letter itself, a ligature (œ, æ), two graphemes, any text.
 * An accent the text does not expect is typed as any other wrong letter: the scoring is unchanged.
 */
export function accentVariant(base: string, candidate: string): string | undefined {
  if (!holdsAccents(base)) return undefined;
  const composed = candidate.normalize("NFC");
  const [first, ...rest] = [...composed.normalize("NFD")];
  // A letter followed by combining marks only is a single grapheme.
  return first === base && rest.length > 0 && COMBINING_MARKS.test(rest.join("")) ? composed : undefined;
}
