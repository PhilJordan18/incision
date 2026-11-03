import Link from "next/link";
import { AccountLink } from "@/components/account-link";
import { pillControl } from "@/components/ui/styles";
import { LogoLink } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/preferences/language-switcher";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locale";

type SiteHeaderProps = { readonly locale: Locale; readonly t: Dictionary; readonly signedIn: boolean };

/**
 * Header of screen 01: logo, preferences, the public rooms (JOUER) and account access. The
 * STATISTIQUES · PROFIL navigation of the design appears with those pages (choice D-15).
 */
export function SiteHeader({ locale, t, signedIn }: SiteHeaderProps) {
  return (
    <header className="mx-auto flex w-full max-w-page flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8 lg:px-12 short:py-3">
      <LogoLink label={t.layout.homeLink} />
      <div className="flex flex-wrap items-center gap-2.5">
        <LanguageSwitcher locale={locale} t={t.layout} />
        <ThemeToggle t={t.layout} />
        <nav aria-label={t.layout.mainNavigation} className="flex items-center gap-2.5">
          {/* JOUER of the design: the public rooms (JOIN-02). */}
          <Link href="/rooms" className={`${pillControl} font-mono text-xs tracking-[0.14em] uppercase`}>{t.layout.play}</Link>
          <AccountLink href={signedIn ? "/account" : "/sign-in"} label={signedIn ? t.layout.account : t.layout.signIn} />
        </nav>
      </div>
    </header>
  );
}
