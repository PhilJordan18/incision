import { describeDatabaseError, type RaceResultView, readRaceForEntrant } from "@incision/database";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { RaceResults } from "@/components/races/race-results";
import { RaceCharts } from "@/components/races/race-charts";
import { StatePanel } from "@/components/ui/state-panel";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import { format } from "@/i18n/format";
import { formatNumber } from "@/i18n/value-format";
import { getRequestDictionary } from "@/i18n/server";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";

type RacePage = { readonly kind: "race"; readonly race: RaceResultView } | { readonly kind: "notFound" } | { readonly kind: "unavailable" };

/** Read once per request (the page and its title share it). Entrants only: anyone else gets "not found". */
const loadRace = cache(async (raceId: string, accountId: string): Promise<RacePage> => {
  try {
    const race = await readRaceForEntrant(authDatabase(), raceId, accountId);
    return race === undefined ? { kind: "notFound" } : { kind: "race", race };
  } catch (error: unknown) {
    unstable_rethrow(error);
    console.error("[races] race page failed:", describeDatabaseError(error));
    return { kind: "unavailable" };
  }
});

export async function generateMetadata({ params }: PageProps<"/races/[id]">): Promise<Metadata> {
  const [{ t, locale }, { id }] = await Promise.all([getRequestDictionary(), params]);
  const { accountId } = await requireAccountSession(`/races/${id}`);
  const page = await loadRace(id, accountId);
  return page.kind === "race"
    ? { title: `${t.races.racePage.title} · ${format(t.races.results.roundLabel, { round: formatNumber(page.race.roundNo, locale) })}`, robots: { index: false } }
    : { title: t.races.racePage.notFoundHeading, robots: { index: false } };
}

/**
 * A race as frozen in the database (HIST-02), for its entrants only, still there once the room
 * closed or was purged. Not found renders in the page (no `notFound()`, see apps/web/AGENTS.md),
 * and looks the same for an unknown id and for a race the account did not run.
 */
export default async function RacePageView({ params }: PageProps<"/races/[id]">) {
  const { id } = await params;
  const { accountId } = await requireAccountSession(`/races/${id}`);
  const [{ t, locale }, page] = await Promise.all([getRequestDictionary(), loadRace(id, accountId)]);
  const home = (
    <Link href="/" className={discreetButton}>
      {t.races.racePage.backHome}
    </Link>
  );
  switch (page.kind) {
    case "unavailable":
      return (
        <StatePanel
          tone="error"
          label={t.errorBoundary.label}
          heading={{ bold: t.errorBoundary.title }}
          actions={
            <>
              <Link href={`/races/${id}`} prefetch={false} className={secondaryButton}>
                {t.errorBoundary.retry}
              </Link>
              {home}
            </>
          }
        >
          <p role="alert">{t.errorBoundary.body}</p>
        </StatePanel>
      );
    case "notFound":
      return (
        <StatePanel tone="neutral" label={t.races.racePage.notFoundLabel} heading={{ bold: t.races.racePage.notFoundHeading }} actions={home}>
          <p>{t.races.racePage.notFound}</p>
        </StatePanel>
      );
    case "race":
      if (page.race.state === "finished") {
        return (
          <div className="flex flex-col gap-6">
            <RaceResults race={page.race} t={t.races} locale={locale} headingId="race-heading" />
            <RaceCharts race={page.race} locale={locale} />
            <div>{home}</div>
          </div>
        );
      }
      return page.race.interruptionReason === null ? (
        // Counting down or running: nothing official yet.
        <StatePanel
          tone="neutral"
          label={t.races.racePage.title}
          heading={{ bold: t.races.racePage.runningHeading }}
          actions={
            <>
              <Link href={`/races/${id}`} prefetch={false} className={secondaryButton}>
                {t.races.racePage.reload}
              </Link>
              {home}
            </>
          }
        >
          <p>{t.races.racePage.running}</p>
        </StatePanel>
      ) : (
        <StatePanel tone="warning" label={t.races.racePage.title} heading={{ bold: t.races.interruptedHeading }} actions={home}>
          <p>{t.races.interrupted[page.race.interruptionReason]}</p>
        </StatePanel>
      );
  }
}
