import { describeDatabaseError, findActiveMembership } from "@incision/database";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { card, secondaryButton } from "@/components/ui/styles";
import { journeyCopy } from "@/i18n/journey";
import type { Locale } from "@/i18n/locale";
import { authDatabase } from "@/server/auth/store";

/** Only called after the account page has authenticated this accountId. No join or presence write. */
export async function AccountJourney({ accountId, locale }: { readonly accountId: string; readonly locale: Locale }) {
  const t = journeyCopy(locale);
  let membership: Awaited<ReturnType<typeof findActiveMembership>> | null;
  try { membership = await findActiveMembership(authDatabase(), accountId); }
  catch (error) {
    unstable_rethrow(error);
    console.error("[account] current room unavailable:", describeDatabaseError(error));
    membership = null;
  }
  return <div className="grid gap-4 md:grid-cols-2">
    <section id="my-rooms" aria-labelledby="my-rooms-title" className={`${card} scroll-mt-4 space-y-4`}>
      <h2 id="my-rooms-title" className="font-display text-3xl font-extrabold uppercase">{t.rooms}</h2>
      <p className="text-embrun">{t.roomHelp}</p>
      {membership === null ? <p role="alert">{t.unavailable}</p> : membership === undefined ? <p className="text-brume">{t.noRoom}</p>
        : <Link href={`/rooms/${membership.code}`} prefetch={false} className={secondaryButton}>{t.returnRoom} · {membership.code}</Link>}
    </section>
    <section aria-labelledby="my-races-title" className={`${card} space-y-4`}>
      <h2 id="my-races-title" className="font-display text-3xl font-extrabold uppercase">{t.races}</h2>
      <p className="text-embrun">{t.historyHelp}</p>
      <Link href="/history" className={secondaryButton}>{t.history}</Link>
    </section>
  </div>;
}
