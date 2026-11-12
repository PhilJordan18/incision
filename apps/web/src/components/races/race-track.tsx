"use client";

import { toGraphemes } from "@incision/domain";
import { memo, type CSSProperties } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatProgress, formatWpm } from "@/races/format";
import type { RaceClientState } from "@/races/race-client";
import { type RouteStyle, type TrackPoint, trackLayout } from "./track-layout";
import styles from "./race-track.module.css";

/**
 * Only public broadcast fields enter the track. No extrapolation, scoring or private photos. The
 * track is decorative for assistive technology: the standings panel beside it lists every runner.
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
  const others = points.filter((point) => !point.labelled).length;
  const horizontalOthers = points.filter((point) => !point.self && point.tone !== "leader").length;
  return <section aria-labelledby="track-heading" className={styles.section}>
    <h2 id="track-heading" className="mb-3 font-display text-2xl font-extrabold uppercase">{t.trackHeading}</h2>
    <p className="sr-only">{text.progression}</p>
    <div className={styles.track} data-testid="race-track" aria-hidden="true">
      <div className={styles.chart} />
      <span className={`${styles.finishText} font-mono text-xs uppercase tracking-widest`}><span className={styles.flag} />{text.finish}</span>
      <div className={styles.finish} />
      {/* The sea routes, under the markers: from the start to each runner's real progress. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`${styles.routes} ${styles.verticalRoutes}`}>
        {points.map((point) => <polyline key={point.runner.entrantId} points={point.path} data-route={point.runner.entrantId}
          className={`${styles.route} ${routeClass(point)}`} />)}
        {points.filter((point) => point.labelled).map((point) => <line key={point.runner.entrantId} className={styles.connector}
          x1={point.x} y1={point.y} x2="63" y2={point.labelY} />)}
      </svg>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`${styles.routes} ${styles.horizontalRoutes}`}>
        {points.map((point) => <polyline key={point.runner.entrantId} points={point.horizontalPath}
          className={`${styles.route} ${routeClass(point)}`} />)}
      </svg>
      {points.map((point) => {
        const { runner } = point;
        const name = names.get(runner.entrantId) ?? "";
        const initials = toGraphemes(name.trim()).slice(0, 2).join("").toLocaleUpperCase(locale);
        const position = { "--point-x": `${point.x}%`, "--point-y": `${point.y}%`, "--label-y": `${point.labelY}%`,
          "--horizontal-x": `${point.horizontalX}%`, "--horizontal-y": `${point.horizontalY}%`,
          "--horizontal-label-x": `${Math.max(2, Math.min(72, point.horizontalX - 5))}%` } as CSSProperties;
        return <div key={runner.entrantId}>
          <span data-runner={runner.entrantId} data-self={point.self || undefined} data-kind={runner.kind} data-position={runner.position}
            data-route-colour={point.route.colour} style={position}
            className={`${styles.point} ${point.labelled ? styles.named : ""} ${styles[point.route.colour]} ${point.self ? styles.self : ""} ${point.tone === "leader" ? styles.leader : ""} ${runner.kind === "bot" ? styles.bot : ""}`}>
            {point.labelled && <span className={styles.initials}>{initials}</span>}
          </span>
          {point.labelled && <span data-track-label style={position} className={`${styles.label} ${point.self ? styles.selfLabel : ""} ${point.tone === "leader" ? styles.leaderLabel : ""}`}>
            <span className={styles.labelName}><RouteSwatch route={point.route} />{runner.kind === "bot" ? "□ " : ""}{name}{point.self ? ` (${t.you})` : ""}</span>
            {/* Two lines at most; the standings say the rest in full. */}
            <span className={styles.labelName}>
              {formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm}
              {runner.inactive ? ` · ◌ ${t.inactive}` : runner.status !== "racing" ? ` · ${t.status[runner.status]}` : ""}
            </span>
          </span>}
        </div>;
      })}
      <span className={`${styles.more} font-mono text-xs`}>
        <span className={styles.verticalMore}>{points.length === 0 ? text.empty : others > 0 ? `+ ${formatNumber(others, locale)} ${text.others}` : ""}</span>
        <span className={styles.horizontalMore}>{points.length === 0 ? text.empty : horizontalOthers > 0 ? `+ ${formatNumber(horizontalOthers, locale)} ${text.others}` : ""}</span>
      </span>
    </div>
  </section>;
});

function routeClass(point: TrackPoint): string {
  return `${styles[point.route.colour]} ${styles[point.route.dash]} ${point.self ? styles.selfRoute : point.labelled ? styles.namedRoute : ""}`;
}

/**
 * A runner's route as a short line sample, beside the name (the track's labels, the standings):
 * the same colour and dash as on the chart. Decorative; the name says who it is.
 */
export function RouteSwatch({ route }: { readonly route: RouteStyle }) {
  return <svg aria-hidden="true" viewBox="0 0 20 6" className={`${styles.swatch} ${styles[route.colour]} ${styles[route.dash]}`}>
    <line x1="1" y1="3" x2="19" y2="3" />
  </svg>;
}
