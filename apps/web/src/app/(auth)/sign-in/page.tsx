import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LogoLink } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/preferences/language-switcher";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { SkipLink } from "@/components/skip-link";
import { FormAlert } from "@/components/ui/form-alert";
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
    // Side by side from 1080 px (the decorative panel and the form); below, the form
    // comes first and the panel is left out, so the first screen is the form.
    <div className="flex min-h-screen flex-col min-[1080px]:flex-row">
      <SkipLink label={t.layout.skipToContent} />
      <aside className="red-mist relative hidden min-h-screen flex-[0_1_40%] flex-col justify-between gap-8 overflow-hidden border-r border-houle bg-nuit px-12 pt-6 pb-10 min-[1080px]:flex">
        <LogoLink label={t.layout.homeLink} size="panel" />
        <div className="relative flex flex-col items-center gap-7">
          <svg viewBox="0 0 360 360" fill="none" aria-hidden="true" focusable="false" className="absolute -top-20 left-1/2 size-[360px] -translate-x-1/2">
            <g className="stroke-brume" strokeOpacity="0.3" strokeDasharray="2 8">
              <circle cx="180" cy="180" r="176" />
              <circle cx="180" cy="180" r="120" />
            </g>
          </svg>
          <Image src="/brand/ico-red.svg" alt="" width={200} height={200} unoptimized className="icon-slow-spin relative" />
          <p className="relative max-w-[380px] text-center font-serif text-[34px] leading-tight">{t.signIn.tagline}</p>
        </div>
        <span aria-hidden="true" />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-6 sm:px-8">
          <span className="min-[1080px]:hidden">
            <LogoLink label={t.layout.homeLink} size="panel" />
          </span>
          <div className="ml-auto flex gap-2.5">
            <LanguageSwitcher locale={locale} t={t.layout} />
            <ThemeToggle t={t.layout} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="flex w-full max-w-[440px] flex-col gap-6">
            <PageHeading bold={t.signIn.headingBold} serif={t.signIn.headingSerif} size="panel" />
            {error !== undefined && <FormAlert message={t.signIn.errors[error]} />}
            <ProviderButtons callbackUrl={callbackUrl} t={t.signIn} />
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
