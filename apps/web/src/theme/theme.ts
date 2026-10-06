/** Night theme of the art direction, and its light variant "Aube" (DES-05). */
export const THEMES = ["abysse", "aube"] as const;
export type Theme = (typeof THEMES)[number];
/** What the visitor chose; "system" follows `prefers-color-scheme` (the default). */
export type ThemeChoice = Theme | "system";

export const THEME_COOKIE = "theme";
/** A year: the choice is a preference, not a session. */
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === "abysse" || value === "aube" ? value : "system";
}

/**
 * Inline script run before the first paint when the choice is "system": it sets
 * `data-theme` from the operating system and follows its changes. An explicit choice is
 * rendered by the server and needs no script. Without JavaScript, Abysse stays.
 */
export const SYSTEM_THEME_SCRIPT = `(function(){try{var d=document.documentElement;if(d.getAttribute("data-theme-choice")!=="system")return;var m=window.matchMedia("(prefers-color-scheme: light)");var a=function(){d.setAttribute("data-theme",m.matches?"aube":"abysse")};a();m.addEventListener("change",function(){if(d.getAttribute("data-theme-choice")==="system")a()})}catch(e){}})()`;
