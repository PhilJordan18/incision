"use client";

import { useSyncExternalStore } from "react";
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
    <>
      <h1 className="text-3xl font-bold">{t.title}</h1>
      <p role="alert">{t.body}</p>
      <p>
        <button
          type="button"
          onClick={retry}
          className="min-h-11 rounded-md bg-foreground px-4 py-2 font-medium text-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {t.retry}
        </button>
      </p>
    </>
  );
}
