import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
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
    <SiteShell locale={locale} t={t} signedIn={session !== null}>
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
    </SiteShell>
  );
}
