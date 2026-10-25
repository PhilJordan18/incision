import type { AccountStatistics } from "@incision/database";
import { card, monoLabel } from "@/components/ui/styles";
import type { Locale } from "@/i18n/locale";
import { profileStatisticsLabels } from "@/i18n/profile-statistics";
import { formatDate, formatNumber } from "@/i18n/value-format";
import { formatAccuracy, formatWpm } from "@/races/format";

/** Server-rendered projection: no chart library, client cache or JavaScript required. */
export function ProfileStatisticsPanel({ data, locale }: { readonly data: AccountStatistics | null; readonly locale: Locale }) {
  const t = profileStatisticsLabels(locale);
  const summary = data?.summary;
  const trend = data?.trend ?? [];
  const maximum = Math.max(1, ...trend.map((point) => point.netWpm));
  const positions = trend.map((point, index) => ({
    x: trend.length === 1 ? 360 : 60 + index / (trend.length - 1) * 600,
    y: 220 - point.netWpm / maximum * 180,
  }));
  const tiles = summary ? [
    { key: "best", label: t.best, value: summary.bestNetWpm === null ? "—" : formatWpm(summary.bestNetWpm, locale), record: true },
    { key: "average", label: t.average, value: summary.averageNetWpm === null ? "—" : formatWpm(summary.averageNetWpm, locale) },
    { key: "accuracy", label: t.accuracy, value: summary.averageAccuracy === null ? "—" : formatAccuracy(summary.averageAccuracy, locale) },
    { key: "races", label: t.races, value: formatNumber(summary.raceCount, locale) },
    { key: "victories", label: t.victories, value: formatNumber(summary.victories, locale) },
  ] : [];
  return (
    <section aria-labelledby="profile-statistics-heading" className="mt-8 flex min-w-0 flex-col gap-5">
      <h2 id="profile-statistics-heading" className="font-display text-4xl font-extrabold uppercase">{t.title}</h2>
      {!data ? <p role="alert" className={`${card} text-erreur`}>{t.unavailable}</p> : <>
        <p className="text-embrun">{t.scope}</p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map((tile) => <div key={tile.key} className={`${card} min-w-0 ${tile.record ? "border-or bg-or/5" : ""}`}>
            <dt className={`${monoLabel} ${tile.record ? "text-or" : ""}`}>{tile.label}</dt>
            <dd data-stat={tile.key} className="mt-2 break-words font-display text-5xl font-extrabold">{tile.value}</dd>
          </div>)}
        </dl>
        <p className="text-sm text-embrun">{t.rules} {t.missing}</p>
        {trend.length === 0 ? <p className={card}>{t.empty}</p> : <section aria-labelledby="profile-progression" className={`${card} min-w-0`}>
          <h3 id="profile-progression" className="font-display text-3xl font-extrabold uppercase">{t.progression}</h3>
          <p className="mt-2 text-sm text-embrun">{t.window}</p>
          <svg viewBox="0 0 720 260" role="img" aria-labelledby="profile-chart-title" className="mt-4 w-full">
            <title id="profile-chart-title">{t.chart}</title>
            {[40, 130, 220].map((y) => <line key={y} x1="60" x2="660" y1={y} y2={y} className="stroke-houle" />)}
            <text x="50" y="45" textAnchor="end" className="fill-embrun text-sm">{formatWpm(maximum, locale)}</text>
            <text x="50" y="225" textAnchor="end" className="fill-embrun text-sm">{formatNumber(0, locale)}</text>
            {positions.length > 1 && <polyline points={positions.map(({ x, y }) => `${x},${y}`).join(" ")}
              fill="none" className="stroke-moi" strokeWidth="3" />}
            {positions.map(({ x, y }, index) => <circle key={trend[index]!.raceId} cx={x} cy={y} r="4" className="fill-moi" />)}
          </svg>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-3 text-embrun underline underline-offset-4">{t.table}</summary>
            <div role="region" aria-label={t.table} tabIndex={0} className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="sr-only">{t.table}</caption>
                <thead><tr>{[t.date, t.outcome, t.wpm, t.precision].map((label) => <th scope="col" key={label} className={`${monoLabel} px-3 py-3`}>{label}</th>)}</tr></thead>
                <tbody>{trend.map((point) => <tr key={point.raceId} className="border-t border-sillage">
                  <th scope="row" className="px-3 py-3 font-mono font-normal"><time dateTime={point.endedAt}>
                    {formatDate(new Date(point.endedAt), locale, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })}
                  </time></th>
                  <td className="px-3 py-3">{t.outcomes[point.outcome]}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatWpm(point.netWpm, locale)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatAccuracy(point.accuracy, locale)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>}
      </>}
    </section>
  );
}
