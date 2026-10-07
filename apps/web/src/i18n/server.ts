import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { type Dictionary, getDictionary } from "./dictionaries";
import { type Locale, LOCALE_COOKIE, resolveLocale } from "./locale";

/** Locale of the current request: explicit cookie, then the browser's languages, then French. */
export const getRequestLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
});

export async function getRequestDictionary(): Promise<{ readonly locale: Locale; readonly t: Dictionary }> {
  const locale = await getRequestLocale();
  return { locale, t: getDictionary(locale) };
}
