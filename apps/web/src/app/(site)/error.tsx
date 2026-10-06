"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { StatePanel } from "@/components/ui/state-panel";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import { getDictionary } from "@/i18n/dictionaries";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locale";

/** The server already chose the language: it is the document's `lang`. */
function useDocumentLocale() {
  return useSyncExternalStore(
    () => () => undefined,
    () => document.documentElement.lang,
    () => DEFAULT_LOCALE,
  );
}

// Next 16: `retry()` re-fetches the segment, which also retries a failed server render.
export default function ErrorBoundary({ retry }: { readonly error: Error & { digest?: string }; readonly retry: () => void }) {
  const lang = useDocumentLocale();
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
