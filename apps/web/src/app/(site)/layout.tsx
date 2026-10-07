import { SiteShell } from "@/components/site-shell";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";

/** Pages with the site header (screen 01) and footer. */
export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [{ locale, t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <SiteShell locale={locale} t={t} signedIn={session !== null}>
      {children}
    </SiteShell>
  );
}
