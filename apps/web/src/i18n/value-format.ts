import type { Locale } from "./locale";

/** Presentation only: callers retain the original numeric value for calculations. */
export function formatNumber(value: number, locale: Locale, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * An explicit zone keeps server rendering and hydration independent of the host's zone.
 * The caller supplies the zone appropriate to the displayed date; language does not imply one.
 */
export function formatDate(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions & { readonly timeZone: string },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}
