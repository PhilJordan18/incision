"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { StatePanel } from "@/components/ui/state-panel";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import { getDictionary } from "@/i18n/dictionaries";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";

// The server already chose the language: it is the document's `lang`, which never changes
// while an error is shown, so there is nothing to subscribe to.
const subscribe = () => () => undefined;
const readDocumentLocale = () => document.documentElement.lang;
const readServerLocale = () => DEFAULT_LOCALE;

/** Body of the error boundaries: what happened and what to do (screen 15). */
export function ErrorState({ retry }: { readonly retry: () => void }) {
  const lang = useSyncExternalStore(subscribe, readDocumentLocale, readServerLocale);
  const t = getDictionary(isLocale(lang) ? lang : DEFAULT_LOCALE).errorBoundary;
  return (
    <StatePanel
      tone="error"
      label={t.label}
      heading={{ bold: t.title }}
      actions={
        <>
          <button type="button" onClick={retry} className={secondaryButton}>
            {t.retry}
          </button>
          <Link href="/" className={discreetButton}>
            {t.backHome}
          </Link>
        </>
      }
    >
      <p role="alert">{t.body}</p>
    </StatePanel>
  );
}
