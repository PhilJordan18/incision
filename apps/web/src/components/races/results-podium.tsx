import type { EntrantResultView } from "@incision/database";
import { card, monoLabel } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locale";
import { resultsPodiumLabels } from "@/i18n/results-podium";
import { formatWpm, ordinal } from "@/races/format";

const STATUS = { finished: "finished", timed_out: "timedOut", abandoned: "abandoned" } as const;

/** Display the persisted rank, never a new WPM-based ranking or a victory calculation. */
export function ResultsPodium({ entrants, locale, t }: {
  readonly entrants: readonly EntrantResultView[];
  readonly locale: Locale;
  readonly t: Dictionary["races"];
}) {
  const places = entrants.filter((entrant) => entrant.result !== undefined && entrant.result.rank <= 3)
    .toSorted((a, b) => a.result!.rank - b.result!.rank);
  if (places.length === 0) return null;
  const labels = resultsPodiumLabels(locale);
  return <section aria-label={labels.title} className="flex min-w-0 flex-col gap-3">
    <h2 className="font-display text-3xl font-extrabold uppercase">{labels.title}</h2>
    <p className="text-sm text-embrun">{labels.explanation}</p>
    <ol className="grid list-none gap-3 p-0 sm:grid-cols-3" role="list">
      {places.map((entrant) => {
        const result = entrant.result!;
        const firstFinisher = result.rank === 1 && result.outcome === "finished";
        return <li key={entrant.ordinal} value={result.rank}
          className={`${card} min-w-0 ${firstFinisher ? "border-or" : ""} ${entrant.isSelf ? "bg-moi/10" : ""}`}>
          <p className={monoLabel}>{t.results.columns.rank}</p>
          <p className="mt-1 font-display text-5xl font-extrabold">{ordinal(result.rank, locale, t.results.ordinal)}</p>
          <p className="mt-3 break-words text-lg font-semibold [overflow-wrap:anywhere]">{entrant.displayName}
            {entrant.isSelf && <span className="font-normal text-brume"> ({t.you})</span>}</p>
          <p className="mt-2 text-sm text-embrun">{t.status[STATUS[result.outcome]]}
            {result.abandonmentReason === null ? "" : ` (${t.abandonReasons[result.abandonmentReason]})`}</p>
          <p className="mt-3 font-mono text-sm">{t.results.columns.netWpm}: {formatWpm(result.netWpm, locale)} {t.wpm}</p>
        </li>;
      })}
    </ol>
  </section>;
}
