"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locale";

/** Saves the interface language (I18N-02) for a year and re-renders the current page. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) {
    return;
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax", httpOnly: true });
  refresh();
}
