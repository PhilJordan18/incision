import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRequestDictionary } from "@/i18n/server";
import { safeRedirectPath } from "@/server/auth/safe-redirect";
import { getAccountSession } from "@/server/auth/session";
import { signInErrorKey } from "@/server/auth/sign-in-errors";
import { CredentialsForm } from "./credentials-form";
import { ProviderButtons } from "./provider-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.signIn.title };
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const [{ t }, session, params] = await Promise.all([getRequestDictionary(), getAccountSession(), searchParams]);
  const callbackUrl = safeRedirectPath(params.callbackUrl);
  if (session !== null) {
    redirect(callbackUrl);
  }
  const error = signInErrorKey(params.error, params.code);

  return (
    <>
      <h1 className="text-3xl font-bold">{t.signIn.title}</h1>
      <p>{t.signIn.intro}</p>
      <div className="grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="providers-heading" className="flex flex-col gap-4">
          <h2 id="providers-heading" className="text-xl font-semibold">
            {t.signIn.providersHeading}
          </h2>
          <ProviderButtons
            callbackUrl={callbackUrl}
            labels={{ github: t.signIn.continueWithGitHub, discord: t.signIn.continueWithDiscord, redirecting: t.signIn.redirecting }}
          />
        </section>
        <section aria-labelledby="local-heading" className="flex flex-col gap-4">
          <h2 id="local-heading" className="text-xl font-semibold">
            {t.signIn.localHeading}
          </h2>
          <CredentialsForm callbackUrl={callbackUrl} initialError={error} t={t.signIn} />
        </section>
      </div>
    </>
  );
}
