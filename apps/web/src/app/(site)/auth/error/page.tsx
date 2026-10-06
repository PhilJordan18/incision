import type { Metadata } from "next";
import Link from "next/link";
import { getRequestDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.authError.title };
}

/** Auth.js' error page (configuration, refused access); the raw error code is never shown. */
export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const [{ t }, params] = await Promise.all([getRequestDictionary(), searchParams]);
  return (
    <>
      <h1 className="text-3xl font-bold">{t.authError.title}</h1>
      <p role="alert">{params.error === "AccessDenied" ? t.authError.accessDenied : t.authError.generic}</p>
      <p>
        <Link href="/sign-in" className="underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {t.authError.backToSignIn}
        </Link>
      </p>
    </>
  );
}
