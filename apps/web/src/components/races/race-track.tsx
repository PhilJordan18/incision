"use client";

import { memo, type CSSProperties } from "react";
import { Coast, Compass, Pennant, Ship } from "@/components/nautical";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatProgress, formatWpm } from "@/races/format";
import type { RaceClientState } from "@/races/race-client";
import { MILESTONES, NARROW_LINK_END, standingsOrder, type TrackPoint, trackLayout, trackX, trackY } from "./track-layout";
import styles from "./race-track.module.css";

/**
 * Only public broadcast fields enter the track. No extrapolation, scoring or private photos. The
 * track is decorative for assistive technology: the standings panel beside it lists every runner.
 *
 * Art direction C1 « Cap »: a named runner is a ship (triangle sail for a human, square for a bot)
 * whose sail, route and pennant share one colour and one dash; the others stay dots, grey on a
 * faint route, so that the named ones stand out in a large crew. The finish
 * is the red coast, with its word; a glass compass sits in the corner furthest from the text.
 */
export const RaceTrack = memo(function RaceTrack({ entrants, progress, selfId, t, locale }: {
  readonly entrants: RaceClientState["entrants"];
  readonly progress: RaceClientState["progress"];
  readonly selfId: string | null;
  readonly t: Dictionary["races"];
  readonly locale: Locale;
}) {
  const text = raceTrackMessages[locale];
  const names = new Map(entrants.map((entrant) => [entrant.entrantId, entrant.displayName]));
  const points = trackLayout(progress?.entrants ?? [], selfId);
  // A label starts with its runner's standings rank: crews often share initials (« Matelot 7 »,
  // « Matelot 13 »), so the track's names and the standings match without colour (rule 8).
  const ranks = new Map(standingsOrder(progress?.entrants ?? []).map((runner, index) => [runner.entrantId, formatNumber(index + 1, locale)]));
  const others = points.filter((point) => !point.labelled).length;
  const horizontalOthers = points.filter((point) => !point.self && point.tone !== "leader").length;
  return <section aria-labelledby="track-heading" className={styles.section}>
    <h2 id="track-heading" className="mb-3 font-display text-2xl font-extrabold uppercase">{t.trackHeading}</h2>
    <p className="sr-only">{text.progression}</p>
    <div className={styles.track} data-testid="race-track" aria-hidden="true">
      {/* The chart: a quarter, a half, three quarters of the text. */}
      {MILESTONES.map((share) => <span key={share} className={`${styles.milestone} font-mono`}
        style={{ "--at-y": `${trackY(share)}%`, "--at-x": `${trackX(share)}%` } as CSSProperties}>
        <span className={styles.milestoneLabel}>{formatProgress(share * 100, 100, locale)}</span>
      </span>)}
      {/* The finish is a coast: one drawing, along the top (vertical chart) or the right (horizontal). */}
      <div className={`${styles.coast} ${styles.verticalOnly}`}><Coast orientation="horizontal" /></div>
      <div className={`${styles.coast} ${styles.horizontalOnly}`}><Coast orientation="vertical" /></div>
      <span data-track-word="finish" className={`${styles.finishText} font-mono text-xs uppercase tracking-widest`}>{text.finish}</span>
      {/* Away from the text sheet, under the routes: it measures nothing and never moves. */}
      <Compass heading={-90} className={`${styles.compass} ${styles.verticalOnly}`} />
      <Compass heading={0} className={`${styles.compass} ${styles.horizontalOnly}`} />
      {/* The sea routes, under the markers: from the start to each runner's real progress. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`${styles.routes} ${styles.verticalRoutes}`}>
        {/* One group, so that a narrow chart moves the lanes inside the drawing and the strokes keep their width. */}
        <g className={styles.verticalLanes}>
          {points.map((point) => <polyline key={point.runner.entrantId} points={point.path} data-route={point.runner.entrantId}
            className={`${styles.route} ${routeClass(point)}`} />)}
          {/* From a marker to its name: 63 % on a wide chart; on a narrow one, where the names' column is reached
              through the lanes' mapping, the value that is drawn at 63 % (NARROW_LINK_END). */}
          {points.filter((point) => point.labelled).map((point) => <line key={point.runner.entrantId} className={`${styles.connector} ${styles.wideLink}`}
            x1={point.x} y1={point.y} x2="63" y2={point.labelY} />)}
          {points.filter((point) => point.labelled).map((point) => <line key={point.runner.entrantId} className={`${styles.connector} ${styles.narrowLink}`}
            x1={point.x} y1={point.y} x2={NARROW_LINK_END} y2={point.labelY} />)}
        </g>
      </svg>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`${styles.routes} ${styles.horizontalRoutes}`}>
        {/* This chart names two runners only (me and the leader): every other route is an unnamed one. */}
        {points.map((point) => <polyline key={point.runner.entrantId} points={point.horizontalPath} data-horizontal-route={point.runner.entrantId}
          className={`${styles.route} ${routeClass(point, point.self || point.tone === "leader")}`} />)}
      </svg>
      {/* Mine last: where hulls overlap, my ship is painted over the others (its z-index says the same). */}
      {[...points.filter((point) => !point.self), ...points.filter((point) => point.self)].map((point) => {
        const { runner } = point;
        const name = names.get(runner.entrantId) ?? "";
        const rank = ranks.get(runner.entrantId) ?? "";
        const leader = point.tone === "leader";
        const position = { "--point-x": `${point.x}%`, "--point-y": `${point.y}%`, "--label-y": `${point.labelY}%`,
          "--horizontal-x": `${point.horizontalX}%`, "--horizontal-y": `${point.horizontalY}%`,
          "--horizontal-label-x": `${Math.max(2, Math.min(60, point.horizontalX - 5))}%` } as CSSProperties;
        return <div key={runner.entrantId}>
          {/* The marker is the runner's real position: a dot, or the foot of a named runner's ship. */}
          <span data-runner={runner.entrantId} data-self={point.self || undefined} data-kind={runner.kind} data-position={runner.position}
            data-route-colour={point.route.colour} data-route-dash={point.route.dash} style={position}
            className={`${styles.point} ${point.labelled ? `${styles.named} ${styles[point.route.colour]}` : styles.anon} ${point.self ? styles.self : ""} ${leader ? styles.leader : ""}`}>
            {point.labelled && <Ship kind={runner.kind} colour={point.route.colour} self={point.self} leader={leader} className={styles.ship} />}
          </span>
          {point.labelled && <span data-track-label style={position} className={`${styles.label} ${point.self ? styles.selfLabel : ""} ${leader ? styles.leaderLabel : ""}`}>
            <span className={styles.labelName}><Pennant kind={runner.kind} colour={point.route.colour} dash={point.route.dash} className={styles.pennant} /><span className={styles.rank}>{rank}</span><span className={styles.nameText}>{name}</span>{point.self && <span data-track-you className={styles.you}> ({t.you})</span>}</span>
            {/* Two lines at most; the standings say the rest in full. */}
            <span className={styles.labelName}>
              {formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm}
              {runner.inactive ? ` · ◌ ${t.inactive}` : runner.status !== "racing" ? ` · ${t.status[runner.status]}` : ""}
            </span>
          </span>}
        </div>;
      })}
      <span data-track-word="others" className={`${styles.more} font-mono text-xs`}>
        <span className={styles.verticalMore}>{points.length === 0 ? text.empty : others > 0 ? `+ ${formatNumber(others, locale)} ${text.others}` : ""}</span>
        <span className={styles.horizontalMore}>{points.length === 0 ? text.empty : horizontalOthers > 0 ? `+ ${formatNumber(horizontalOthers, locale)} ${text.others}` : ""}</span>
      </span>
    </div>
  </section>;
});

function routeClass(point: TrackPoint, named = point.labelled): string {
  // A runner without a name on the chart sails a faint grey dotted route; its own colour and dash
  // show as soon as it is named, and always on its pennant in the standings.
  if (!named) return styles.anonRoute ?? "";
  return `${styles[point.route.colour]} ${styles[point.route.dash]} ${point.self ? styles.selfRoute : styles.namedRoute}`;
}
