export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
/** Cookie holding an explicit choice (the selector comes with CP-05); it wins over the browser. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
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
      const quality = parameters.map((parameter) => /^\s*q=([01](?:\.\d{0,3})?)\s*$/.exec(parameter)?.[1]).find(Boolean);
      return { language: tag.trim().toLowerCase().split("-")[0], quality: quality === undefined ? 1 : Number(quality), index };
    })
    .filter((preference) => preference.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferences.map((preference) => preference.language).find(isLocale) ?? DEFAULT_LOCALE;
}
