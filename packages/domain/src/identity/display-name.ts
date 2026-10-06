/**
 * Display names (account nickname, room presence). Unicode is allowed; uniqueness inside
 * a room compares a canonical form: trimmed, NFKC, lowercase, accents kept (D-04).
 */
export const DISPLAY_NAME_MAX_LENGTH = 40;

export type DisplayNameParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: "INVALID_DISPLAY_NAME" };

/** NFKC, trimmed, inner whitespace collapsed; 1 to 40 code points, no control characters. */
export function parseDisplayName(input: string): DisplayNameParseResult {
  const value = input.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const length = [...value].length;
  if (length === 0 || length > DISPLAY_NAME_MAX_LENGTH || /\p{Cc}/u.test(value)) {
    return { ok: false, error: "INVALID_DISPLAY_NAME" };
  }
  return { ok: true, value };
}

export function canonicalDisplayName(displayName: string): string {
  return displayName.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}
