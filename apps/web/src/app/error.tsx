"use client";

import { ErrorState } from "@/components/errors/error-state";

/** Errors outside the (site) pages, e.g. the sign-in screen or the site layout itself. */
export default function RootErrorBoundary({ retry }: { readonly error: Error & { digest?: string }; readonly retry: () => void }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-page flex-1 flex-col px-4 py-8 sm:px-8 lg:px-12">
      <ErrorState retry={retry} />
    </main>
  );
}
