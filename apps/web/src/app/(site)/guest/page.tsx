import Link from "next/link";
import { redirect } from "next/navigation";
import { findActiveHumanMembership } from "@incision/database";
import { PageHeading } from "@/components/ui/page-heading";
import { discreetButton } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { guestEntryEnabled } from "@/server/identity/guest-entry-switch";
import { requestGuest } from "@/server/identity/guest-request";
import { GuestEntryForm } from "./guest-entry-form";

export async function generateMetadata() {
  const { t } = await getRequestDictionary(); return { title: t.guestEntry.title, robots: { index: false } };
}

export default async function GuestPage({ searchParams }: PageProps<"/guest">) {
  const { t } = await getRequestDictionary();
  if (!guestEntryEnabled()) return <p role="status">{t.guestEntry.unavailable}</p>;
  if (await getAccountSession() !== null) redirect("/account");
  const guest = await requestGuest();
  if (guest !== undefined) {
    const member = await findActiveHumanMembership(authDatabase(), { kind: "guest", guestSessionId: guest.proof.id });
    if (member !== undefined) redirect(`/rooms/${member.code}`);
  }
  const params = await searchParams;
  return <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 py-8">
    <div className="flex flex-col items-center gap-3 text-center">
      <PageHeading bold={t.guestEntry.headingBold} serif={t.guestEntry.headingSerif} />
      <p className="text-brume">{t.guestEntry.intro}</p>
    </div>
    <GuestEntryForm t={t.guestEntry} initialCode={typeof params.code === "string" ? params.code.slice(0, 32) : ""} />
    <Link href="/sign-in" className={`${discreetButton} self-start`}>{t.guestEntry.account}</Link>
  </div>;
}
