import "server-only";
import { cookies } from "next/headers";
import { parseThemeChoice, THEME_COOKIE, type ThemeChoice } from "./theme";

export async function getThemeChoice(): Promise<ThemeChoice> {
  return parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
}
