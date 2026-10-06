import { readAccountProfile } from "@incision/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRequestDictionary } from "@/i18n/server";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { SignOutForm } from "./sign-out-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.account.title };
}

/** Protected on the server: no valid session, no page (the navigation link is only a convenience). */
export default async function AccountPage() {
  const { accountId } = await requireAccountSession("/account");
  const [{ t }, profile] = await Promise.all([getRequestDictionary(), readAccountProfile(authDatabase(), accountId)]);
  if (profile === undefined) {
    redirect("/sign-in");
  }
  return (
    <>
      <h1 className="text-3xl font-bold">{t.account.title}</h1>
      <p>
        {t.account.signedInAs} <strong className="font-semibold">{profile.displayName}</strong>
      </p>
      <section className="flex max-w-sm flex-col gap-3">
        <p>{t.account.signOutScope}</p>
        <SignOutForm labels={{ signOut: t.account.signOut, signingOut: t.account.signingOut, signOutFailed: t.account.signOutFailed }} />
      </section>
    </>
  );
}
