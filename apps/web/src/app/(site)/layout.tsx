import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";

/** Pages with the site header (screen 01) and footer. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [{ locale, t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <>
      <SkipLink label={t.layout.skipToContent} />
      <SiteHeader locale={locale} t={t} signedIn={session !== null} />
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-page flex-1 flex-col gap-10 px-4 py-8 sm:px-8 lg:px-12">
        {children}
      </main>
      <SiteFooter text={t.layout.footer} />
    </>
  );
}
