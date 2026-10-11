import { format } from "../i18n/format";
import type { Locale } from "../i18n/locale";

type OrdinalForms = { readonly one: string; readonly two: string; readonly few: string; readonly other: string };

/** "1er", "2e" in French; "1st", "2nd", "3rd", "11th", "21st" in English. */
export function ordinal(rank: number, locale: Locale, forms: OrdinalForms): string {
  const category = new Intl.PluralRules(locale, { type: "ordinal" }).select(rank);
  const template = category === "one" || category === "two" || category === "few" ? forms[category] : forms.other;
  return format(template, { rank });
}

/**
 * An elapsed race time, "m:ss.d" (design: durations as `2:28`), truncated to the tenth, with the
 * language's decimal separator ("0:20,5" in French, I18N-03).
 */
export function formatElapsed(ms: number, locale: Locale): string {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const separator = new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === "decimal")?.value ?? ".";
  return `${minutes}:${String(seconds).padStart(2, "0")}${separator}${tenths % 10}`;
}

/** Time left on the clock, "m:ss", rounded up so it reads 0:00 only at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Display rounding only (the exact values are stored): WPM to the unit. */
export function formatWpm(wpm: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(wpm);
}

/** Accuracy to the tenth, with the language's percent sign and spacing ("96,4 %", "96.4%"). */
export function formatAccuracy(accuracy: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(accuracy / 100);
}

/** Progress as a whole percentage, never 100 % before the end. */
export function formatProgress(position: number, length: number, locale: Locale): string {
  const ratio = length === 0 ? 0 : position / length;
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, roundingMode: "floor" }).format(ratio);
}
