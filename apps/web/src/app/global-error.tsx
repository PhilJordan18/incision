"use client";

// Replaces the root layout when it fails, so the locale and the theme are unknown here:
// both languages are shown, from the dictionaries, with the night theme's tokens.
import { getDictionary } from "@/i18n/dictionaries";
import "./globals.css";

const french = getDictionary("fr").globalError;
const english = getDictionary("en").globalError;

export default function GlobalError({ retry }: { readonly error: Error & { digest?: string }; readonly retry: () => void }) {
  return (
    <html lang="fr">
      <head>
        <title>{`${french.title} · ${english.title}`}</title>
      </head>
      <body className="flex min-h-screen items-center justify-center bg-abysse p-6 text-ecume">
        <main className="flex max-w-xl flex-col gap-4 rounded-carte border border-erreur bg-nuit p-6">
          <h1 className="font-display text-5xl font-black uppercase">
            {french.title} <span lang="en">· {english.title}</span>
          </h1>
          <p role="alert">{french.body}</p>
          <p lang="en">{english.body}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-[52px] items-center justify-center self-start rounded-bouton border border-ecume px-6 font-semibold"
          >
            {french.retry} · <span lang="en">{english.retry}</span>
          </button>
        </main>
      </body>
    </html>
  );
}
