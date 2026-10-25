import { describeDatabaseError, parseHistoryCursor, readAccountHistory, type HistoryPage } from "@incision/database";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { PageHeading } from "@/components/ui/page-heading";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";
import { getHistoryDictionary } from "@/i18n/dictionaries/history";
import { getRequestLocale } from "@/i18n/server";
import { formatDate, formatNumber } from "@/i18n/value-format";
import { formatAccuracy, formatWpm } from "@/races/format";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: getHistoryDictionary(locale).title, robots: { index: false, follow: false } };
}

const historyHref = (cursor: string) => `/history?cursor=${encodeURIComponent(cursor)}`;

/** Request-scoped, authenticated SSR. Cursor positions never select the account. */
export default async function History({ searchParams }: PageProps<"/history">) {
  const { accountId } = await requireAccountSession("/history");
  const [locale, params] = await Promise.all([getRequestLocale(), searchParams]);
  const t = getHistoryDictionary(locale);
  const invalid = parseHistoryCursor(params.cursor) === null;
  let page: HistoryPage | null = null;
  let unavailable = false;
  if (!invalid) {
    try {
      page = await readAccountHistory(authDatabase(), { accountId, cursor: params.cursor });
    } catch (error: unknown) {
      unstable_rethrow(error);
      console.error("[history] read failed:", describeDatabaseError(error));
      unavailable = true;
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeading bold={t.bold} serif={t.serif} />
      <p className="text-embrun">{t.intro}</p>
      <Link href="/account" className={`${discreetButton} self-start`}>{t.account}</Link>
      {invalid || unavailable ? (
        <section className={`${card} flex flex-col items-start gap-4`}>
          <p role="alert">{invalid ? t.invalid : t.unavailable}</p>
          <Link href={unavailable && typeof params.cursor === "string" ? historyHref(params.cursor) : "/history"} prefetch={false} className={secondaryButton}>
            {unavailable ? t.retry : t.first}
          </Link>
        </section>
      ) : page && page.rows.length > 0 ? (
        <>
          <p className="text-sm text-embrun md:hidden">{t.scroll}</p>
          <div role="region" aria-label={t.table} tabIndex={0} className={`${card} overflow-x-auto p-0`}>
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <caption className="sr-only">{t.table}</caption>
              <thead>
                <tr className="border-b border-sillage">
                  {[t.date, t.round, t.outcome, t.wpm, t.accuracy, t.rank, t.result].map((label) => (
                    <th key={label} scope="col" className={`${monoLabel} px-4 py-3`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr key={row.raceId} className="border-b border-sillage last:border-0">
                    <th scope="row" className="px-4 py-3 whitespace-nowrap font-mono font-normal">
                      <time dateTime={row.endedAt}>{formatDate(new Date(row.endedAt), locale, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}</time>
                    </th>
                    <td className="px-4 py-3 font-mono">{formatNumber(row.roundNo, locale)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.outcomes[row.outcome]}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatWpm(row.netWpm, locale)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatAccuracy(row.accuracy, locale)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatNumber(row.rank, locale)}</td>
                    <td className="px-4 py-3"><Link href={`/races/${row.raceId}`} prefetch={false} className={`${discreetButton} whitespace-nowrap`}>{t.open}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label={t.navigation} className="flex flex-wrap gap-3">
            {page.newer && <Link href={historyHref(page.newer)} prefetch={false} className={secondaryButton}>{t.newer}</Link>}
            {page.older && <Link href={historyHref(page.older)} prefetch={false} className={secondaryButton}>{t.older}</Link>}
          </nav>
        </>
      ) : (
        <section className={`${card} flex flex-col items-start gap-4`}>
          <p>{t.empty}</p><p className="text-embrun">{t.emptyHelp}</p>
          {params.cursor !== undefined && <Link href="/history" className={secondaryButton}>{t.first}</Link>}
        </section>
      )}
    </div>
  );
}
