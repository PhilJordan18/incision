import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locale";

type SiteShellProps = { readonly locale: Locale; readonly t: Dictionary; readonly signedIn: boolean; readonly children: ReactNode };

/** Header, main region and footer of the site's pages (screen 01). */
export function SiteShell({ locale, t, signedIn, children }: SiteShellProps) {
  return (
    <>
      <SkipLink label={t.layout.skipToContent} />
      <SiteHeader locale={locale} t={t} signedIn={signedIn} />
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-page flex-1 flex-col gap-10 px-4 py-8 sm:px-8 lg:gap-8 lg:px-12 lg:py-6">
        {children}
      </main>
      <SiteFooter text={t.layout.footer} />
    </>
  );
}
