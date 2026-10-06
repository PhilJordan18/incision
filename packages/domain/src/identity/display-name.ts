/**
 * Display names (account nickname, room presence). Unicode is allowed; uniqueness inside
 * a room compares a canonical form: normalised, lowercase, accents kept (D-04, D-14).
 */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Control, format (zero-width, joiners, bidi overrides), private-use and unassigned
 * characters, default-ignorable ones (variation selectors, Hangul fillers...) and the
 * blank braille pattern: all render as nothing or as an unchanged neighbour.
 */
const INVISIBLE_OR_UNASSIGNED = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\u2800]/u;
/** A combining mark with no base character to attach to. */
const LEADING_MARK = /^\p{M}/u;

export type DisplayNameParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: "INVALID_DISPLAY_NAME" };

/**
 * NFKC, trimmed, inner whitespace collapsed; 1 to 40 code points (PostgreSQL `char_length`).
 * Invisible characters are refused because they would let a name look identical to
 * another one in the same room; emoji joined with U+200D or styled with U+FE0F are
 * refused for the same reason.
 */
export function parseDisplayName(input: string): DisplayNameParseResult {
  if (!input.isWellFormed()) {
    return { ok: false, error: "INVALID_DISPLAY_NAME" };
  }
  const value = normaliseDisplayName(input);
  const length = [...value].length;
  if (
    length === 0 ||
    length > DISPLAY_NAME_MAX_LENGTH ||
    INVISIBLE_OR_UNASSIGNED.test(value) ||
    LEADING_MARK.test(value)
  ) {
    return { ok: false, error: "INVALID_DISPLAY_NAME" };
  }
  return { ok: true, value };
}

export function canonicalDisplayName(displayName: string): string {
  return normaliseDisplayName(displayName).toLowerCase();
}

function normaliseDisplayName(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/gu, " ");
}
