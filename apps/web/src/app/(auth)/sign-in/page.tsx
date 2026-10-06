import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LogoLink } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/preferences/language-switcher";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { SkipLink } from "@/components/skip-link";
import { PageHeading } from "@/components/ui/page-heading";
import { monoLabel } from "@/components/ui/styles";
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

/**
 * Sign-in (screen 02). No sign-up tab and no "remember me" at the checkpoint: local
 * accounts come from the seed and sessions last 24 h; the guest link comes with AUTH-02
 * (choice D-15).
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const [{ locale, t }, session, params] = await Promise.all([getRequestDictionary(), getAccountSession(), searchParams]);
  const callbackUrl = safeRedirectPath(params.callbackUrl);
  if (session !== null) {
    redirect(callbackUrl);
  }
  const error = signInErrorKey(params.error, params.code);

  return (
    <div className="flex min-h-screen flex-wrap">
      <SkipLink label={t.layout.skipToContent} />
      <aside className="red-mist relative flex flex-[1_1_520px] flex-col justify-between gap-8 overflow-hidden border-houle bg-nuit px-4 py-6 sm:px-12 sm:py-10 md:min-h-screen md:border-r">
        <LogoLink label={t.layout.homeLink} size="panel" />
        <div className="relative hidden flex-col items-center gap-7 md:flex">
          <svg viewBox="0 0 360 360" fill="none" aria-hidden="true" focusable="false" className="absolute -top-20 left-1/2 size-[360px] -translate-x-1/2">
            <g className="stroke-brume" strokeOpacity="0.3" strokeDasharray="2 8">
              <circle cx="180" cy="180" r="176" />
              <circle cx="180" cy="180" r="120" />
            </g>
          </svg>
          <Image src="/brand/ico-red.svg" alt="" width={200} height={200} unoptimized className="icon-slow-spin relative" />
          <p className="relative max-w-[380px] text-center font-serif text-[34px] leading-tight">{t.signIn.tagline}</p>
        </div>
        <span aria-hidden="true" className="hidden md:block" />
      </aside>
      <div className="flex flex-[999_1_560px] flex-col">
        <div className="flex justify-end gap-2.5 px-4 pt-6 sm:px-8">
          <LanguageSwitcher locale={locale} t={t.layout} />
          <ThemeToggle labels={{ toAube: t.layout.themeToAube, toAbysse: t.layout.themeToAbysse }} />
        </div>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="flex w-full max-w-[440px] flex-col gap-6">
            <PageHeading bold={t.signIn.headingBold} serif={t.signIn.headingSerif} size="panel" />
            {error !== undefined && (
              <p role="alert" className="flex gap-2 rounded-bouton border border-erreur bg-erreur-fond px-4 py-3 text-erreur">
                <span aria-hidden="true">⚠</span>
                {t.signIn.errors[error]}
              </p>
            )}
            <ProviderButtons
              callbackUrl={callbackUrl}
              labels={{
                github: t.signIn.continueWithGitHub,
                discord: t.signIn.continueWithDiscord,
                githubAria: t.signIn.gitHubAriaLabel,
                discordAria: t.signIn.discordAriaLabel,
                group: t.signIn.providersLabel,
                redirecting: t.signIn.redirecting,
              }}
            />
            <p className={`${monoLabel} flex items-center gap-3`}>
              <span aria-hidden="true" className="h-px grow bg-houle" />
              {t.signIn.separator}
              <span aria-hidden="true" className="h-px grow bg-houle" />
            </p>
            <CredentialsForm callbackUrl={callbackUrl} t={t.signIn} />
            <p className="text-[13px] leading-relaxed text-brume">{t.signIn.privacyNote}</p>
          </div>
        </main>
      </div>
    </div>
  );
}
