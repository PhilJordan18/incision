import type { EntrantResultView, RaceResultView, StoredKeyErrors } from "@incision/database";
import { card, monoLabel } from "@/components/ui/styles";
import { raceCharts } from "@/i18n/race-charts";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { formatElapsed } from "@/races/format";
import { BotIdentityLabel } from "./bot-identity-label";

type Copy = (typeof raceCharts)[Locale];
const title = "font-display text-3xl font-extrabold uppercase";
const cell = "px-4 py-3 font-mono text-right whitespace-nowrap";
const keyboardRows = ["azertyuiop^$", "qsdfghjklmù*", "<wxcvbn,;:!é"] as const;
const keyboardKeys = new Set([...keyboardRows.join(""), " "]);

/** Server-rendered from the authenticated result projection; no public per-player heatmap. */
export function RaceCharts({ race, locale }: { readonly race: RaceResultView; readonly locale: Locale }) {
  if (race.state !== "finished") return null;
  const t = raceCharts[locale];
  return <div className="flex min-w-0 flex-col gap-8">
    <section aria-labelledby="race-speed-heading" className={`${card} min-w-0 space-y-4`}>
      <h2 id="race-speed-heading" className={title}>{t.speed}</h2>
      <p className="text-sm text-embrun">{t.speedHelp}</p>
      <SpeedPlot entrants={race.entrants} locale={locale} t={t} />
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {race.entrants.map((entrant) => <li key={entrant.ordinal} className={entrant.isSelf ? "text-moi" : "text-embrun"}>
          {formatNumber(entrant.ordinal, locale)}. {entrant.displayName}{entrant.isSelf ? ` (${t.you})` : ""}
          <BotIdentityLabel kind={entrant.kind} level={entrant.botLevel} locale={locale} />
          {entrant.result?.wpmSeries === undefined ? ` — ${t.missing}` : ""}
        </li>)}
      </ol>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-embrun underline underline-offset-4">{t.values}</summary>
        <p className="mb-4 text-sm text-brume">{t.precision}</p>
        <div className="space-y-6">
          {race.entrants.map((entrant) => <section key={entrant.ordinal} aria-label={`${t.runner} ${entrant.displayName}`}>
            <h3 className="mb-2 font-semibold">{entrant.displayName}{entrant.isSelf ? ` (${t.you})` : ""}</h3>
            <BotIdentityLabel kind={entrant.kind} level={entrant.botLevel} locale={locale} />
            {entrant.result?.wpmSeries === undefined ? <p>{t.missing}</p> : <>
              <SpeedPlot entrants={[entrant]} locale={locale} t={t} />
              <div role="region" aria-label={`${t.values} — ${entrant.displayName}`} tabIndex={0} className="max-h-96 overflow-auto rounded-bouton border border-houle">
                <table className="w-full min-w-[440px] border-collapse">
                  <caption className="sr-only">{entrant.displayName} — {t.speed}</caption>
                  <thead><tr>{[t.time, t.net, t.raw].map((label) => <th key={label} scope="col" className={`${monoLabel} ${cell}`}>{label}</th>)}</tr></thead>
                  <tbody>{entrant.result.wpmSeries.points.map((point) => <tr key={point.elapsed} className="border-t border-sillage">
                    <th scope="row" className={cell}>{formatNumber(point.elapsed / 1000, locale, { maximumFractionDigits: 3 })} s</th>
                    <td className={cell}>{formatNumber(point.measures.netWpm, locale, { maximumFractionDigits: 6 })}</td>
                    <td className={cell}>{formatNumber(point.measures.rawWpm, locale, { maximumFractionDigits: 6 })}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
          </section>)}
        </div>
      </details>
    </section>
    {race.entrants.some((entrant) => entrant.isSelf) && <KeyHeatmap aggregate={race.personalKeyErrors} locale={locale} t={t} />}
  </div>;
}

function SpeedPlot({ entrants, locale, t }: { readonly entrants: readonly EntrantResultView[]; readonly locale: Locale; readonly t: Copy }) {
  const collected = entrants.filter((entrant) => entrant.result?.wpmSeries !== undefined);
  if (collected.length === 0) return <p className="text-embrun">{t.missing}</p>;
  let maxTime = 1;
  let maxWpm = 1;
  for (const entrant of collected) for (const point of entrant.result!.wpmSeries!.points) {
    maxTime = Math.max(maxTime, point.elapsed);
    maxWpm = Math.max(maxWpm, point.measures.netWpm);
  }
  const x = (elapsed: number) => 65 + 660 * elapsed / maxTime;
  const y = (wpm: number) => 245 - 215 * wpm / maxWpm;
  return <div role="region" aria-label={t.graph} tabIndex={0} className="overflow-x-auto p-1">
    <svg viewBox="0 0 800 290" role="img" aria-label={t.graph} className="h-auto w-full min-w-[800px]">
    <title>{t.graph}</title>
    <desc>{t.speedHelp} {collected.map((entrant) => `${entrant.ordinal}. ${entrant.displayName}`).join("; ")}</desc>
    {[0, maxWpm / 2, maxWpm].map((value) => <g key={value}>
      <line x1={65} x2={725} y1={y(value)} y2={y(value)} className="stroke-houle" />
      <text x={55} y={y(value) + 4} textAnchor="end" className="fill-embrun text-xs">{formatNumber(value, locale, { maximumFractionDigits: 1 })}</text>
    </g>)}
    <text x={65} y={16} className="fill-embrun text-xs">{t.unit}</text>
    <text x={65} y={275} className="fill-embrun text-xs">{formatElapsed(0, locale)}</text>
    <text x={725} y={275} textAnchor="end" className="fill-embrun text-xs">{formatElapsed(maxTime, locale)}</text>
    {collected.map((entrant) => {
      const points = entrant.result!.wpmSeries!.points;
      const last = points.at(-1)!;
      const color = entrant.isSelf ? "stroke-moi" : entrant.result?.rank === 1 ? "stroke-or" : "stroke-embrun";
      return <g key={entrant.ordinal}>
        <polyline fill="none" strokeWidth={2} strokeDasharray={entrant.isSelf ? undefined : `${2 + entrant.ordinal % 4 * 3} 3`} className={color}
          points={points.map((point) => `${x(point.elapsed)},${y(point.measures.netWpm)}`).join(" ")} />
        {entrant.kind === "bot"
          ? <rect x={x(last.elapsed) - 3} y={y(last.measures.netWpm) - 3} width={6} height={6} rx={1} className="fill-embrun" />
          : <circle cx={x(last.elapsed)} cy={y(last.measures.netWpm)} r={3} className={entrant.isSelf ? "fill-moi" : "fill-embrun"} />}
        <text x={x(last.elapsed) + 5} y={y(last.measures.netWpm) - 6} className="fill-ecume text-xs">{formatNumber(entrant.ordinal, locale)}</text>
      </g>;
    })}
    </svg>
  </div>;
}

function KeyHeatmap({ aggregate, locale, t }: { readonly aggregate: StoredKeyErrors | undefined; readonly locale: Locale; readonly t: Copy }) {
  const counts = new Map(aggregate?.keys.map(({ grapheme, count }) => [grapheme, count]));
  const maximum = [...counts.values()].reduce((largest, count) => Math.max(largest, count), 1);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const keyLabel = (key: string) => key === " " ? t.space : key;
  const keyCell = (key: string) => {
    const count = counts.get(key) ?? 0;
    const tone = count === 0 ? "border-houle bg-sillage" : count >= maximum / 2 ? "border-erreur bg-erreur-fond" : "border-or bg-sillage";
    return <span key={key} tabIndex={0} aria-label={`${keyLabel(key)} — ${formatNumber(count, locale)} ${t.count.toLowerCase()}`}
      className={`flex min-h-14 min-w-11 flex-col items-center justify-center rounded-puce border px-2 font-mono text-ecume ${tone}`}>
      <span className="break-all">{keyLabel(key)}</span><span className="text-xs">{formatNumber(count, locale)}</span>
    </span>;
  };
  return <section aria-labelledby="race-keys-heading" className={`${card} min-w-0 space-y-4`}>
    <h2 id="race-keys-heading" className={title}>{t.heatmap}</h2>
    <p className="text-sm text-embrun">{t.private}</p>
    {aggregate === undefined ? <p>{t.missing}</p> : <>
      <p className="font-semibold">{t.total} : {formatNumber(total, locale)}</p>
      {total === 0 && <p>{t.zero}</p>}
      <h3 className="font-semibold">{t.keyboard}</h3>
      <p className="text-sm text-embrun">{t.keyboardHelp}</p>
      <p className="text-sm text-brume">{t.low} — {t.high}</p>
      <div role="region" aria-label={t.keyboard} tabIndex={0} className="overflow-x-auto p-1">
        <div className="min-w-[620px] space-y-2">
          {keyboardRows.map((row) => <div key={row} className="grid grid-cols-12 gap-1">{[...row].map(keyCell)}</div>)}
          <div className="mx-auto w-1/2">{keyCell(" ")}</div>
        </div>
      </div>
      {aggregate.keys.some(({ grapheme }) => !keyboardKeys.has(grapheme)) && <div>
        <h3 className="mb-2 font-semibold">{t.others}</h3>
        <div className="flex flex-wrap gap-2">{aggregate.keys.filter(({ grapheme }) => !keyboardKeys.has(grapheme)).map(({ grapheme }) => keyCell(grapheme))}</div>
      </div>}
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-embrun underline underline-offset-4">{t.heatValues}</summary>
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">{t.heatValues}</caption>
          <thead><tr><th scope="col" className={`${monoLabel} p-3 text-left`}>{t.character}</th><th scope="col" className={`${monoLabel} p-3 text-right`}>{t.count}</th></tr></thead>
          <tbody>{aggregate.keys.map(({ grapheme, count }) => <tr key={grapheme} className="border-t border-sillage">
            <th scope="row" className="break-all p-3 text-left font-mono">{keyLabel(grapheme)}</th><td className="p-3 text-right font-mono">{formatNumber(count, locale)}</td>
          </tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>;
}
