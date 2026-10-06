import type { Dictionary } from "@/i18n/dictionaries";
import { type Locale, LOCALES } from "@/i18n/locale";
import { setLocaleAction } from "./actions";

type LanguageSwitcherProps = { readonly locale: Locale; readonly t: Dictionary["layout"] };

/** "FR / EN" pill of the header; the active language is pressed. Works without JavaScript. */
export function LanguageSwitcher({ locale, t }: LanguageSwitcherProps) {
  return (
    <form action={setLocaleAction}>
      <div role="group" aria-label={t.languageLabel} className="flex h-11 items-center rounded-full border border-houle px-1.5 font-mono text-xs tracking-[0.14em]">
        {LOCALES.map((option, index) => (
          <span key={option} className="flex items-center">
            {index > 0 && (
              <span aria-hidden="true" className="text-voile">
                /
              </span>
            )}
            <button
              type="submit"
              name="locale"
              value={option}
              lang={option}
              aria-label={t.languageNames[option]}
              aria-pressed={option === locale}
              className="h-11 min-w-11 rounded-full px-2 uppercase text-brume aria-pressed:text-ecume hover:text-ecume"
            >
              {option}
            </button>
          </span>
        ))}
      </div>
    </form>
  );
}
