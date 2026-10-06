import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { StatePanel } from "@/components/ui/state-panel";
import { secondaryButton } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.notFound.title };
}

/** Unknown pages render outside the (site) group, so the shell is composed here. */
export default async function NotFound() {
  const [{ locale, t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <>
      <SkipLink label={t.layout.skipToContent} />
      <SiteHeader locale={locale} t={t} signedIn={session !== null} />
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 py-8 sm:px-8 lg:px-12">
        <StatePanel
          tone="neutral"
          label={t.notFound.label}
          heading={{ bold: t.notFound.headingBold, serif: t.notFound.headingSerif }}
          actions={
            <Link href="/" className={secondaryButton}>
              {t.notFound.backHome}
            </Link>
          }
        >
          <p>{t.notFound.body}</p>
        </StatePanel>
      </main>
      <SiteFooter text={t.layout.footer} />
    </>
  );
}
