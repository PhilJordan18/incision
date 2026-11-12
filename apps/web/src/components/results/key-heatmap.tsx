"use client";

import { useState } from "react";
import type { StoredKeyErrors } from "@incision/database";
import { card, monoLabel, fieldLabel, textField } from "@/components/ui/styles";
import { raceCharts } from "@/i18n/race-charts";
import type { Locale } from "@/i18n/locale";
import { formatNumber } from "@/i18n/value-format";
import { characterLayoutCopy } from "@/i18n/character-layouts";
import { CHARACTER_LAYOUTS, characterLayouts, representedCharacters, type CharacterLayout } from "@/results/character-layouts";

const title = "font-display text-3xl font-extrabold uppercase";

export function KeyHeatmap({ aggregate, locale }: { readonly aggregate: StoredKeyErrors | undefined; readonly locale: Locale }) {
  const t = raceCharts[locale];
  const copy = characterLayoutCopy(locale);
  const [layout, setLayout] = useState<CharacterLayout>(locale === "fr" ? "fr-azerty" : "us-qwerty");
  const keyboardRows = characterLayouts[layout];
  const keyboardKeys = representedCharacters(layout);
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
      <label className={`${fieldLabel} block max-w-xl`}>{copy.label}
        <select value={layout} aria-describedby="layout-help layout-temporary" onChange={event => {
          const chosen = CHARACTER_LAYOUTS.find(value => value === event.target.value);
          if (chosen) setLayout(chosen);
        }} className={`${textField} mt-2 block max-w-full`}>
          {CHARACTER_LAYOUTS.map(value => <option key={value} value={value}>{copy.names[value]}</option>)}
        </select>
      </label>
      <p id="layout-temporary" className="text-sm text-brume">{copy.temporary}</p>
      <noscript><p>{copy.noScript}</p></noscript>
      <h3 className="font-semibold">{copy.names[layout]}</h3>
      <p id="layout-help" className="text-sm text-embrun">{copy.help}</p>
      <p className="text-sm text-brume">{t.low} — {t.high}</p>
      <div role="region" aria-label={copy.reference} tabIndex={0} className="overflow-x-auto p-1">
        <div className="min-w-[620px] space-y-2">
          {keyboardRows.map((row) => <div key={row} className="grid grid-cols-13 gap-1">{[...row].map(keyCell)}</div>)}
          <div className="mx-auto w-1/2">{keyCell(" ")}</div>
        </div>
      </div>
      {aggregate.keys.some(({ grapheme }) => !keyboardKeys.has(grapheme)) && <div>
        <h3 className="mb-2 font-semibold">{copy.others}</h3>
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
