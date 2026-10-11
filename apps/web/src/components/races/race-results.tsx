import type { RaceResultView } from "@incision/database";
import Link from "next/link";
import { card, monoLabel, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { formatAccuracy, formatElapsed, formatWpm, ordinal } from "@/races/format";

type RaceResultsProps = {
  readonly race: RaceResultView;
  readonly t: Dictionary["races"];
  readonly locale: Locale;
  /** Shown in the room: a link to the race's own page (HIST-02). */
  readonly linkToRace?: boolean;
  readonly headingId?: string;
};

const OUTCOME_STATUS = { finished: "finished", timed_out: "timedOut", abandoned: "abandoned" } as const;

/**
 * Results of a finished race (screen 10, adapted to COURSE-10, D-15): the ranking comes from the
 * engine and puts arrivals first, then time-outs and abandons by progress, never WPM first.
 * Read from the database once saved, so a reload shows exactly what was stored.
 */
export function RaceResults({ race, t, locale, linkToRace = false, headingId }: RaceResultsProps) {
  const ranked = race.entrants.filter((entrant) => entrant.result !== undefined);
  const self = race.entrants.find((entrant) => entrant.isSelf);
  const finishers = ranked.filter((entrant) => entrant.result?.outcome === "finished").length;
  return (
    <section aria-labelledby={headingId ?? "results-heading"} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className={monoLabel}>
          <span aria-hidden="true">[.</span>
          {t.results.label} · {format(t.results.roundLabel, { round: race.roundNo })}
          <span aria-hidden="true">]</span>
        </p>
        {/* The view's main heading, in the room as on the race's own page. */}
        <h1 id={headingId ?? "results-heading"} tabIndex={-1} className="font-display text-5xl leading-[0.9] font-black uppercase outline-none sm:text-[64px]">
          {t.results.headingBold} <em className="font-serif font-normal normal-case italic">{t.results.headingSerif}</em>
        </h1>
      </div>

      {self?.result !== undefined ? (
        <div className="flex flex-col gap-6">
          <p className="red-mist flex items-baseline gap-4 self-start pr-6">
            <span className="font-display text-[96px] leading-none font-black text-moi sm:text-[120px]">{ordinal(self.result.rank, locale, t.results.ordinal)}</span>
            <span className="font-display text-2xl font-extrabold text-brume uppercase">{format(t.results.rankOf, { count: ranked.length })}</span>
          </p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t.results.columns.netWpm} value={formatWpm(self.result.netWpm, locale)} unit={t.wpm} />
            <Tile label={t.results.columns.rawWpm} value={formatWpm(self.result.rawWpm, locale)} unit={t.wpm} />
            <Tile label={t.results.columns.accuracy} value={formatAccuracy(self.result.accuracy, locale)} />
            <Tile label={t.results.columns.time} value={formatElapsed(self.result.elapsedMs)} />
          </dl>
        </div>
      ) : self === undefined ? (
        <p className="text-embrun">{t.results.spectator}</p>
      ) : null}

      {finishers === 0 && <p className="text-embrun">{t.results.noVictory}</p>}

      <div className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-sillage">
              {[t.results.columns.rank, t.results.columns.runner, t.results.columns.status, t.results.columns.time, t.results.columns.netWpm, t.results.columns.accuracy].map(
                (label, index) => (
                  <th key={label} scope="col" className={`${monoLabel} px-4 py-3 ${index >= 3 ? "text-right" : ""}`}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {ranked.map((entrant) => {
              const result = entrant.result;
              if (result === undefined) {
                return null;
              }
              return (
                <tr key={entrant.ordinal} className={`border-b border-sillage last:border-b-0 ${entrant.isSelf ? "bg-moi/10" : ""}`}>
                  <td className="px-4 py-3 font-mono">{ordinal(result.rank, locale, t.results.ordinal)}</td>
                  <th scope="row" className="px-4 py-3 font-semibold">
                    {entrant.displayName}
                    {entrant.isSelf ? <span className="font-normal text-brume"> ({t.you})</span> : null}
                  </th>
                  <td className="px-4 py-3 text-embrun">
                    {result.outcome === "finished" ? "" : <span aria-hidden="true">· </span>}
                    {t.status[OUTCOME_STATUS[result.outcome]]}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatElapsed(result.elapsedMs)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatWpm(result.netWpm, locale)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatAccuracy(result.accuracy, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-brume">{t.results.rounding}</p>

      {linkToRace && (
        <Link href={`/races/${race.raceId}`} className={`${secondaryButton} self-start`}>
          {t.results.openRace}
        </Link>
      )}
    </section>
  );
}

function Tile({ label, value, unit }: { readonly label: string; readonly value: string; readonly unit?: string }) {
  return (
    <div className={`${card} flex flex-col gap-1 p-4`}>
      <dt className={monoLabel}>{label}</dt>
      <dd className="font-display text-4xl font-extrabold">
        {value}
        {unit !== undefined && <span className="ml-1 text-base font-semibold text-brume">{unit}</span>}
      </dd>
    </div>
  );
}
