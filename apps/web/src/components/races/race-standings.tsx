"use client";

import { memo } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatProgress, formatWpm } from "@/races/format";
import type { RaceClientState } from "@/races/race-client";
import { RouteSwatch } from "./race-track";
import { routeStyles, standingsOrder } from "./track-layout";
import styles from "./race-panels.module.css";

/**
 * The left panel of the race: every runner, furthest first, as text (the track is decorative for
 * assistive technology). Public broadcast fields only. Not a live region: four full lists a second
 * would drown the typing's announcements.
 */
export const RaceStandings = memo(function RaceStandings({ entrants, progress, selfId, t, locale }: {
  readonly entrants: RaceClientState["entrants"];
  readonly progress: RaceClientState["progress"];
  readonly selfId: string | null;
  readonly t: Dictionary["races"];
  readonly locale: Locale;
}) {
  const text = raceScreenMessages[locale];
  const track = raceTrackMessages[locale];
  const names = new Map(entrants.map((entrant) => [entrant.entrantId, entrant.displayName]));
  const runners = standingsOrder(progress?.entrants ?? []);
  // The legend of the chart: each name beside its route's colour and dash.
  const routes = routeStyles(progress?.entrants ?? [], selfId);
  return (
    <section aria-labelledby="standings-heading" className={`${styles.log} flex min-w-0 flex-col gap-2 self-start lg:h-full lg:self-stretch`}>
      <h2 id="standings-heading" className={`${styles.logHeading} font-display text-2xl font-extrabold uppercase`}>
        {text.standingsHeading}
        <span className="ml-2 font-mono text-sm font-normal text-brume">({formatNumber(runners.length, locale)})</span>
      </h2>
      {/* On a short desktop screen (≤ 820 px high) the row has no room for it beside the runners: read, not shown. */}
      <p className="text-sm text-brume lg:[@media(max-height:820px)]:sr-only">{text.standingsNote}</p>
      {runners.length === 0 ? (
        <p className="text-sm text-embrun">{text.standingsEmpty}</p>
      ) : (
        // Scrolls inside the panel for a large crew; reachable with the keyboard (WCAG 2.1.1).
        // Two compact lines per runner, so a short row still shows several; your own line sticks
        // to the edge of the list while it is scrolled out of view (30 or 50 runners).
        <ol tabIndex={0} aria-label={text.standingsHeading}
          className="flex max-h-[28rem] flex-col overflow-auto rounded-lg lg:max-h-none lg:min-h-0 lg:grow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moi">
          {runners.map((runner, index) => {
            const self = runner.entrantId === selfId;
            const name = names.get(runner.entrantId) ?? "";
            return (
              <li key={runner.entrantId} data-standing={runner.entrantId}
                className={`flex gap-3 border-b border-sillage py-2 ${self ? "sticky top-0 bottom-0 z-10 border-l-4 border-l-moi bg-nuit pl-3" : ""}`}>
                <span className="w-7 shrink-0 font-display text-xl leading-none font-extrabold text-embrun">
                  <span className="sr-only">{text.rank} </span>
                  {formatNumber(index + 1, locale)}
                </span>
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="block break-words font-semibold leading-tight">
                    <RouteSwatch route={routes.get(runner.entrantId)!} />
                    {name}
                    {self ? ` (${t.you})` : ""}
                    {runner.kind === "bot" ? ` · □ ${track.bot}` : ""}
                  </span>
                  <span className="block font-mono text-xs text-brume">
                    {formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm} · {t.status[runner.status]}
                    {runner.inactive ? ` · ◌ ${t.inactive}` : ""}
                  </span>
                  <progress aria-label={name} value={runner.position} max={runner.length} className={`${styles.bar} ${self ? styles.self : ""}`} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
