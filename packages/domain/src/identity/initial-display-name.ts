import { parseDisplayName } from "./display-name";

/**
 * Display name given to an account created by an OAuth sign-in (D-14): the first
 * candidate that is a valid display name (e.g. the provider's name, then its login),
 * otherwise a neutral name built from the provider and its stable subject. Only this
 * value is stored, once; the provider profile itself is never kept.
 */
export function initialDisplayName(
  candidates: readonly (string | null | undefined)[],
  fallback: { readonly provider: string; readonly subject: string },
): string {
  for (const candidate of [...candidates, `${fallback.provider}-${fallback.subject}`, fallback.provider]) {
    if (typeof candidate === "string") {
      const parsed = parseDisplayName(candidate);
      if (parsed.ok) {
        return parsed.value;
      }
    }
  }
  throw new Error("No valid display name, not even the provider name");
}
