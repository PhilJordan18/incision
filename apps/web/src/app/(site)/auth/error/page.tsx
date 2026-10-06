import type { Metadata } from "next";
import Link from "next/link";
import { StatePanel } from "@/components/ui/state-panel";
import { secondaryButton } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.authError.title };
}

/** Auth.js' error page (configuration, refused access); the raw error code is never shown. */
export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const [{ t }, params] = await Promise.all([getRequestDictionary(), searchParams]);
  return (
    <StatePanel
      tone="error"
      label={t.authError.label}
      heading={{ bold: t.authError.headingBold, serif: t.authError.headingSerif }}
      actions={
        <Link href="/sign-in" className={secondaryButton}>
          {t.authError.backToSignIn}
        </Link>
      }
    >
      <p role="alert">{params.error === "AccessDenied" ? t.authError.accessDenied : t.authError.generic}</p>
    </StatePanel>
  );
}
