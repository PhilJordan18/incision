import { readAccountProfile, readAccountStatistics, readProfilePhotoRevision } from "@incision/database";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui/page-heading";
import { card, monoLabel, secondaryButton } from "@/components/ui/styles";
import { getHistoryDictionary } from "@/i18n/dictionaries/history";
import { getRequestDictionary } from "@/i18n/server";
import { profileNameLabels } from "@/i18n/profile-name";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { SignOutForm } from "./sign-out-form";
import { DisplayNameForm } from "./display-name-form";
import { PhotoForm } from "./photo-form";
import { uploadPhotoAction } from "./photo-action";
import { profilePhotoLabels } from "@/i18n/profile-photo";
import { ProfileStatisticsPanel } from "./profile-statistics";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.account.title, robots: { index: false, follow: false } };
}

/** Protected on the server: no valid session, no page (the header link is only a convenience). */
export default async function AccountPage() {
  const { accountId } = await requireAccountSession("/account");
  const [{ t, locale }, profile] = await Promise.all([getRequestDictionary(), readAccountProfile(authDatabase(), accountId)]);
  if (profile === undefined) {
    redirect("/sign-in");
  }
  const photoRevision = await readProfilePhotoRevision(authDatabase(), accountId);
  const photoLabels = profilePhotoLabels(locale);
  // A failed statistics query is not an empty history and must not prevent profile editing.
  const statistics = await readAccountStatistics(authDatabase(), accountId).catch(() => null);
  return (
    <>
      <PageHeading bold={t.account.headingBold} serif={t.account.headingSerif} />
      <section className={`${card} flex max-w-xl flex-col gap-5`}>
        {photoRevision ? <Image src={`/api/account/photo?v=${photoRevision}`} width={180} height={180}
          alt={photoLabels.alt} unoptimized className="h-[180px] w-[180px] rounded-full object-cover" />
          : <span aria-hidden="true" className="grid h-[180px] w-[180px] place-items-center rounded-full bg-mer font-display text-7xl text-ecume">
            {Array.from(profile.displayName)[0]}
          </span>}
        <PhotoForm labels={photoLabels} uploadAction={uploadPhotoAction} />
        <div className="flex flex-col gap-1">
          <p className={monoLabel}>{t.account.displayNameLabel}</p>
          <p className="break-all text-2xl font-semibold">{profile.displayName}</p>
        </div>
        <DisplayNameForm name={profile.displayName} labels={profileNameLabels(locale)} />
        <p className="text-embrun">{t.account.signOutScope}</p>
        <Link href="/history" className={secondaryButton}>{getHistoryDictionary(locale).title}</Link>
        <SignOutForm labels={{ signOut: t.account.signOut, signingOut: t.account.signingOut, signOutFailed: t.account.signOutFailed }} />
      </section>
      <ProfileStatisticsPanel data={statistics} locale={locale} />
    </>
  );
}
