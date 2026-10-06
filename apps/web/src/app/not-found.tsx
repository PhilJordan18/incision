import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/errors/not-found-panel";
import { SiteShell } from "@/components/site-shell";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.notFound.title };
}

/** Unknown URLs render outside the (site) group, so the shell is composed here. */
export default async function NotFound() {
  const [{ locale, t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <SiteShell locale={locale} t={t} signedIn={session !== null}>
      <NotFoundPanel t={t.notFound} />
    </SiteShell>
  );
}
