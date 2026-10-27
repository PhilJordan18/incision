import type { ErrorMode } from "@incision/domain";
import type { Locale } from "@/i18n/locale";
import { typingLegendMessages } from "@/i18n/typing-legend";
import { monoLabel } from "@/components/ui/styles";

/** Static guidance, independent of keystrokes and live announcements. No reveal means no assumed mode. */
export function TypingLegend({ mode, locale }: { readonly mode: ErrorMode | undefined; readonly locale: Locale }) {
  if (mode === undefined) return null;
  const t = typingLegendMessages[locale];
  return (
    <section aria-label={t.title} className="flex flex-col gap-3">
      <p className={monoLabel}>{t[mode]}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-brume">
        <li className="flex items-baseline gap-2">
          <span aria-hidden="true" className="font-mono text-ecume underline decoration-juste decoration-[3px] underline-offset-[7px]">a</span>
          {t.correct}
        </li>
        <li className="flex items-baseline gap-2">
          <span aria-hidden="true" className={`font-mono text-erreur bg-erreur-fond underline decoration-wavy underline-offset-[7px] ${mode === "mandatory" ? "outline-2 outline-erreur" : ""}`}>a</span>
          {mode === "mandatory" ? t.blocked : t.wrong}
        </li>
        <li className="flex items-baseline gap-2">
          <span aria-hidden="true" className="border-l-2 border-ecume pl-1 font-mono text-brume">a</span>
          {t.cursor}
        </li>
      </ul>
    </section>
  );
}
