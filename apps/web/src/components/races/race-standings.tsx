"use client";

import { memo } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatProgress, formatWpm } from "@/races/format";
import type { RaceClientState } from "@/races/race-client";
import { standingsOrder } from "./track-layout";
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
  return (
    <section aria-labelledby="standings-heading" className={`${styles.panel} flex min-w-0 flex-col gap-3 self-start`}>
      <h2 id="standings-heading" className="font-display text-2xl font-extrabold uppercase">
        {text.standingsHeading}
        <span className="ml-2 font-mono text-sm font-normal text-brume">({formatNumber(runners.length, locale)})</span>
      </h2>
      <p className="text-sm text-brume">{text.standingsNote}</p>
      {runners.length === 0 ? (
        <p className="text-sm text-embrun">{text.standingsEmpty}</p>
      ) : (
        // Scrolls inside the panel for a large crew; reachable with the keyboard (WCAG 2.1.1).
        <ol tabIndex={0} aria-label={text.standingsHeading}
          className="flex max-h-[28rem] flex-col gap-3 overflow-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moi">
          {runners.map((runner, index) => {
            const self = runner.entrantId === selfId;
            const name = names.get(runner.entrantId) ?? "";
            return (
              <li key={runner.entrantId} data-standing={runner.entrantId} className={`flex gap-3 border-b border-sillage pb-3 ${self ? "border-l-4 border-l-moi pl-3" : ""}`}>
                <span className="w-8 shrink-0 font-display text-2xl leading-none font-extrabold text-embrun">
                  <span className="sr-only">{text.rank} </span>
                  {formatNumber(index + 1, locale)}
                </span>
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="block break-words font-semibold">
                    {name}
                    {self ? ` (${t.you})` : ""}
                    {runner.kind === "bot" ? ` · □ ${track.bot}` : ""}
                  </span>
                  <span className="block font-mono text-sm text-brume">
                    {formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm}
                  </span>
                  <progress aria-label={name} value={runner.position} max={runner.length} className={`h-2 w-full ${self ? "accent-moi" : "accent-brume"}`} />
                  <span className="text-sm text-brume">
                    {t.status[runner.status]}
                    {runner.inactive ? ` · ◌ ${t.inactive}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
