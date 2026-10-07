/** Messages of the sign-in page, keys of `signIn.errors` in the dictionaries. */
export type SignInErrorKey = "invalidCredentials" | "rateLimited" | "providerFailed" | "unavailable";

const PROVIDER_ERRORS = new Set(["OAuthCallbackError", "OAuthSignInError", "OAuthAccountNotLinked", "AccessDenied"]);

/**
 * Message for the `error` and `code` parameters Auth.js puts on its redirects. The raw
 * values are never displayed; an unknown error gets the generic message.
 */
export function signInErrorKey(error: unknown, code: unknown): SignInErrorKey | undefined {
  if (typeof error !== "string" || error === "") {
    return undefined;
  }
  if (error === "CredentialsSignin") {
    if (code === "busy") {
      return "unavailable";
    }
    return code === "rate_limited" ? "rateLimited" : "invalidCredentials";
  }
  return PROVIDER_ERRORS.has(error) ? "providerFailed" : "unavailable";
}
