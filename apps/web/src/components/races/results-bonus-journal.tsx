import type { RaceResultView } from "@incision/database";
import { card } from "@/components/ui/styles";
import { bonusJournalLabels } from "@/i18n/bonus-journal";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { BotIdentityLabel } from "./bot-identity-label";

/** Native disclosure works with the keyboard and without client JavaScript. */
export function ResultsBonusJournal({ race, locale, t }: {
  readonly race: RaceResultView; readonly locale: Locale; readonly t: Dictionary["races"];
}) {
  const labels = bonusJournalLabels[locale];
  const seconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  return <section aria-label={labels.heading} className="flex min-w-0 flex-col gap-3">
    <h2 className="font-display text-3xl font-extrabold uppercase">{labels.heading}</h2>
    <p className="text-sm text-brume">{labels.help}</p>
    {race.entrants.filter((entrant) => entrant.result !== undefined).map((entrant) => {
      const journal = entrant.result?.bonusJournal;
      return <details key={entrant.ordinal} className={`${card} min-w-0 p-4`}>
        <summary className="min-h-11 cursor-pointer content-center break-words font-semibold">
          {entrant.displayName}<BotIdentityLabel kind={entrant.kind} level={entrant.botLevel} locale={locale} />
          {entrant.isSelf ? ` (${t.you})` : ""}
        </summary>
        {journal === undefined ? <p className="mt-3 text-brume">{labels.unavailable}</p>
          : journal.grants.length === 0 ? <p className="mt-3 text-brume">{labels.none}</p>
            : <ul className="mt-3 flex flex-col gap-3 text-embrun">
              {journal.grants.map((grant) => {
                const target = race.entrants.find((one) => one.ordinal === grant.activation?.targetOrdinal);
                return <li key={grant.milestone} className="break-words">
                  <p className="font-semibold">{t.bonuses.kinds[grant.kind]} · {format(labels.milestone, { value: grant.milestone })}</p>
                  <p>{grant.activation === undefined ? labels.unused : format(labels.activated, {
                    target: target?.displayName ?? `#${grant.activation.targetOrdinal}`,
                    seconds: seconds.format(grant.activation.atMs / 1000),
                  })}</p>
                </li>;
              })}
            </ul>}
      </details>;
    })}
  </section>;
}
