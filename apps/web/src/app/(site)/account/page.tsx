import { readAccountProfile } from "@incision/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui/page-heading";
import { card, monoLabel } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { SignOutForm } from "./sign-out-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.account.title };
}

/** Protected on the server: no valid session, no page (the header link is only a convenience). */
export default async function AccountPage() {
  const { accountId } = await requireAccountSession("/account");
  const [{ t }, profile] = await Promise.all([getRequestDictionary(), readAccountProfile(authDatabase(), accountId)]);
  if (profile === undefined) {
    redirect("/sign-in");
  }
  return (
    <>
      <PageHeading bold={t.account.headingBold} serif={t.account.headingSerif} />
      <section className={`${card} flex max-w-xl flex-col gap-5`}>
        <div className="flex flex-col gap-1">
          <p className={monoLabel}>{t.account.displayNameLabel}</p>
          <p className="text-2xl font-semibold">{profile.displayName}</p>
        </div>
        <p className="text-embrun">{t.account.signOutScope}</p>
        <SignOutForm labels={{ signOut: t.account.signOut, signingOut: t.account.signingOut, signOutFailed: t.account.signOutFailed }} />
      </section>
    </>
  );
}
