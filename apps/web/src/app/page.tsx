import Link from "next/link";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";
import { SITE_NAME } from "./site";

export default async function Home() {
  const [{ t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <>
      <h1 className="text-4xl font-bold tracking-tight">{SITE_NAME}</h1>
      <p className="text-lg">{t.home.tagline}</p>
      <p>
        <Link
          href={session === null ? "/sign-in" : "/account"}
          className="inline-flex min-h-11 items-center rounded-md bg-foreground px-4 py-2 font-medium text-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {session === null ? t.home.signInCta : t.home.accountCta}
        </Link>
      </p>
    </>
  );
}
