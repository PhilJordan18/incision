"use client";

import { MoonIcon, SunIcon } from "@/components/icons/icons";
import { pillControl } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { PREFERENCE_COOKIE_MAX_AGE, THEME_COOKIE, type Theme } from "@/theme/theme";

type ThemeToggleProps = { readonly t: Pick<Dictionary["layout"], "themeToAube" | "themeToAbysse"> };

/**
 * Switches between Abysse and Aube and remembers the choice in a cookie read by the
 * server, so the next page renders in the right theme without a flash (DES-05). Until a
 * choice is made, the system preference applies. Which label shows is decided by CSS
 * from `data-theme`, so the server and the browser render the same markup.
 */
export function ThemeToggle({ t }: ThemeToggleProps) {
  function toggle(): void {
    const root = document.documentElement;
    const next: Theme = root.getAttribute("data-theme") === "aube" ? "abysse" : "aube";
    root.setAttribute("data-theme", next);
    root.setAttribute("data-theme-choice", next);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${PREFERENCE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }

  return (
    <button type="button" onClick={toggle} className={pillControl}>
      <span className="only-abysse">
        <MoonIcon />
        <span className="sr-only">{t.themeToAube}</span>
      </span>
      <span className="only-aube">
        <SunIcon />
        <span className="sr-only">{t.themeToAbysse}</span>
      </span>
    </button>
  );
}
