/** Where to go after signing in when no valid destination is given. */
export const DEFAULT_AFTER_SIGN_IN = "/account";

/**
 * Keeps only a same-site absolute path (`/account`, `/rooms?x=1`), never a full URL, a
 * protocol-relative `//host` or a backslash variant that browsers treat as one.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  try {
    const url = new URL(value, "http://incision.invalid");
    return url.origin === "http://incision.invalid" ? `${url.pathname}${url.search}` : DEFAULT_AFTER_SIGN_IN;
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
}
