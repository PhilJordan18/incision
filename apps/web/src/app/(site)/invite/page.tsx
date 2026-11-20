import type { Metadata } from "next";
import { getRequestDictionary } from "@/i18n/server";
import { invitationCopy } from "@/i18n/invitations";
import { getAccountSession } from "@/server/auth/session";
import { guestEntryEnabled } from "@/server/identity/guest-entry-switch";
import { InvitationEntry } from "./invitation-entry";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getRequestDictionary();
  return { title: invitationCopy(locale).join, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export default async function InvitationPage() {
  const { locale, t } = await getRequestDictionary();
  return <InvitationEntry locale={locale} guestCopy={t.guestEntry} account={await getAccountSession() !== null} guestsEnabled={guestEntryEnabled()} />;
}
