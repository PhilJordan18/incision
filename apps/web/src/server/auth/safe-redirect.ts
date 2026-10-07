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
    // Dot segments normalise "/..//evil.example" into "//evil.example": judge the result.
    const path = `${url.pathname}${url.search}`;
    if (url.origin !== "http://incision.invalid" || path.startsWith("//") || path.includes("\\")) {
      return DEFAULT_AFTER_SIGN_IN;
    }
    return path;
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
}
