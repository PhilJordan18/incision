"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE, LOCALES } from "@/i18n/locale";
import { parseServerEnv } from "@/server/config";
import { PREFERENCE_COOKIE_MAX_AGE } from "@/theme/theme";

const localeSchema = z.enum(LOCALES);

/** Saves the interface language (I18N-02) for a year and re-renders the current page. */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!locale.success) {
    return;
  }
  (await cookies()).set(LOCALE_COOKIE, locale.data, {
    path: "/",
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: parseServerEnv(process.env).secureCookies,
  });
  refresh();
}
