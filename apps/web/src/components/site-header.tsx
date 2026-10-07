import { AccountLink } from "@/components/account-link";
import { LogoLink } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/preferences/language-switcher";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locale";

type SiteHeaderProps = { readonly locale: Locale; readonly t: Dictionary; readonly signedIn: boolean };

/**
 * Header of screen 01: logo, preferences, account access. The JOUER · STATISTIQUES ·
 * PROFIL navigation of the design appears with those pages (choice D-15).
 */
export function SiteHeader({ locale, t, signedIn }: SiteHeaderProps) {
  return (
    <header className="mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8 lg:px-12 short:py-3">
      <LogoLink label={t.layout.homeLink} />
      <div className="flex flex-wrap items-center gap-2.5">
        <LanguageSwitcher locale={locale} t={t.layout} />
        <ThemeToggle t={t.layout} />
        <nav aria-label={t.layout.mainNavigation}>
          <AccountLink href={signedIn ? "/account" : "/sign-in"} label={signedIn ? t.layout.account : t.layout.signIn} />
        </nav>
      </div>
    </header>
  );
}
