export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
/** Cookie holding an explicit choice (the selector comes with CP-05); it wins over the browser. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function languageQuality(parameters: readonly string[]): number {
  if (parameters.length === 0) return 1;
  if (parameters.length !== 1) return 0;
  // RFC 9110 §12.4.2: q is case-insensitive, 0–1 with at most three decimals.
  // An invalid weight must not be promoted to the default priority of an unweighted entry.
  const match = /^[\t ]*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)[\t ]*$/i.exec(parameters[0] ?? "");
  return match === null ? 0 : Number(match[1]);
}

/**
 * Explicit cookie first, then the browser's `Accept-Language` preferences in quality
 * order (`fr-CA` counts as `fr`), then French. Malformed entries are ignored.
 */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) {
    return cookieValue;
  }
  const preferences = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      return { language: tag.trim().toLowerCase().split("-")[0], quality: languageQuality(parameters), index };
    })
    .filter((preference) => preference.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferences.map((preference) => preference.language).find(isLocale) ?? DEFAULT_LOCALE;
}
