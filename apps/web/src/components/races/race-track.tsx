"use client";

import { toGraphemes } from "@incision/domain";
import { memo, type CSSProperties } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatProgress, formatWpm } from "@/races/format";
import type { RaceClientState } from "@/races/race-client";
import { trackLayout } from "./track-layout";
import styles from "./race-track.module.css";

/** Only public broadcast fields enter the track. No extrapolation, scoring or private photos. */
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
  return <section aria-labelledby="track-heading" className="w-full min-w-0 self-start">
    <h2 id="track-heading" className="mb-3 font-display text-2xl font-extrabold uppercase">{t.trackHeading}</h2>
    <p className="sr-only">{text.progression}</p>
    <div className={styles.track} data-testid="race-track" aria-hidden="true">
      <span className={`${styles.finishText} font-mono text-xs uppercase tracking-widest`}>[.{text.finish}]</span>
      <div className={styles.finish} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.connectors}>
        {points.filter((point) => point.labelled).map((point) => <line key={point.runner.entrantId} x1={point.x} y1={point.y} x2="63" y2={point.labelY} />)}
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
            style={position} className={`${styles.point} ${point.labelled ? styles.named : ""} ${styles[point.tone] ?? ""} ${runner.kind === "bot" ? styles.bot : ""}`}>
            {point.labelled && <span className={styles.initials}>{initials}</span>}
          </span>
          {point.labelled && <span data-track-label style={position} className={`${styles.label} ${point.self ? styles.selfLabel : ""} ${point.tone === "leader" ? styles.leaderLabel : ""}`}>
            <span className={styles.labelName}>{name}{point.self ? ` (${t.you})` : ""}</span>
            <span>{formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm}</span>
            {runner.kind === "bot" && <span className="block">□ {text.bot}</span>}
            {(runner.inactive || runner.status !== "racing") && <span className="block">{runner.inactive ? `◌ ${t.inactive}` : t.status[runner.status]}</span>}
          </span>}
        </div>;
      })}
      <span className={`${styles.more} font-mono text-xs`}>
        <span className={styles.verticalMore}>{points.length === 0 ? text.empty : others > 0 ? `+ ${formatNumber(others, locale)} ${text.others}` : ""}</span>
        <span className={styles.horizontalMore}>{points.length === 0 ? text.empty : horizontalOthers > 0 ? `+ ${formatNumber(horizontalOthers, locale)} ${text.others}` : ""}</span>
      </span>
    </div>
    <details open={points.length <= 6} className="mt-3 rounded-xl border border-houle bg-nuit p-3">
      <summary className="min-h-11 cursor-pointer content-center rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moi">
        {text.all} ({formatNumber(points.length, locale)})
      </summary>
      <ul tabIndex={0} className="mt-3 flex max-h-96 flex-col gap-3 overflow-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moi" aria-label={t.trackHeading}>
        {points.map(({ runner, self }) => <li key={runner.entrantId} className={`border-b border-sillage pb-3 ${self ? "border-l-4 border-l-moi pl-3" : ""}`}>
          <span className="block break-words font-semibold">{names.get(runner.entrantId)}{self ? ` (${t.you})` : ""}{runner.kind === "bot" ? ` · □ ${text.bot}` : ""}</span>
          <span className="block font-mono text-sm text-brume">{formatProgress(runner.position, runner.length, locale)} · {formatWpm(runner.netWpm, locale)} {t.wpm}</span>
          <progress aria-label={names.get(runner.entrantId)} value={runner.position} max={runner.length} className={`h-2 w-full ${self ? "accent-moi" : "accent-brume"}`} />
          <span className="text-sm text-brume">{t.status[runner.status]}{runner.inactive ? ` · ◌ ${t.inactive}` : ""}</span>
        </li>)}
      </ul>
    </details>
  </section>;
});
