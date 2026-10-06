"use client";

// Replaces the root layout when it fails, so the locale and the theme are unknown here:
// both languages are shown, with the night theme's tokens (I18N-01).
import "./globals.css";

export default function GlobalError({ retry }: { readonly error: Error & { digest?: string }; readonly retry: () => void }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center bg-abysse p-6 text-ecume">
        <main className="flex max-w-xl flex-col gap-4 rounded-carte border border-erreur bg-nuit p-6">
          <h1 className="font-display text-5xl font-black uppercase">Avarie</h1>
          <p role="alert">Le site n’a pas pu s’afficher. Réessaie dans un moment.</p>
          <p lang="en">The site could not be displayed. Try again in a moment.</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-[52px] items-center justify-center self-start rounded-bouton border border-ecume px-6 font-semibold"
          >
            Réessayer · <span lang="en">Try again</span>
          </button>
        </main>
      </body>
    </html>
  );
}
