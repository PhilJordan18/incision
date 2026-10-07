/**
 * Local sign-in identifier (AUTH-01 credentials). ASCII only, so its canonical form is a
 * plain lowercase that PostgreSQL can check (`login_canonical = lower(login)`).
 */
export const LOGIN_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
export const LOGIN_MAX_LENGTH = 32;
/**
 * Longest password a sign-in form accepts. The hash cost does not depend on it, but it
 * bounds request bodies; local accounts are created by the seed, not by a sign-up form.
 */
export const PASSWORD_MAX_LENGTH = 128;

export type Login = { readonly login: string; readonly canonical: string };

export type LoginParseResult = { readonly ok: true; readonly value: Login } | { readonly ok: false; readonly error: "INVALID_LOGIN" };

/** Trims the input, checks the allowed characters and length, and derives the case-insensitive key. */
export function parseLogin(input: string): LoginParseResult {
  const login = input.trim();
  if (!LOGIN_PATTERN.test(login)) {
    return { ok: false, error: "INVALID_LOGIN" };
  }
  return { ok: true, value: { login, canonical: login.toLowerCase() } };
}
