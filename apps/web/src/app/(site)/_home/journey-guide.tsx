import type { Locale } from "@/i18n/locale";
import { journeyCopy } from "@/i18n/journey";
import { card } from "@/components/ui/styles";

/** A static original chart mark, separate from the student's untouched logo. */
export function JourneyGuide({ locale }: { readonly locale: Locale }) {
  const t = journeyCopy(locale);
  return <section aria-labelledby="journey-heading" className="space-y-5 border-t border-houle pt-8">
    <div className="flex items-center gap-4">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" className="h-16 w-16 shrink-0 text-brume" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="23" strokeDasharray="2 6" /><path d="M32 2v10m0 40v10M2 32h10m40 0h10m-20-9 8-8-8 26-8 8Z" /><circle cx="32" cy="32" r="3" />
      </svg>
      <div><h2 id="journey-heading" className="font-display text-3xl font-extrabold uppercase">{t.guide}</h2><p className="text-embrun">{t.intro}</p></div>
    </div>
    <ol className="grid gap-4 md:grid-cols-2">
      {t.steps.map((step, index) => <li key={step.title} className={`${card} space-y-3`}>
        <span aria-hidden="true" className="font-mono text-sm text-brume">{String(index + 1).padStart(2, "0")}</span>
        <h3 className="text-lg font-semibold">{step.title}</h3><p className="text-sm leading-relaxed text-embrun">{step.body}</p>
      </li>)}
    </ol>
  </section>;
}
