"use client";

import { ErrorState } from "@/components/errors/error-state";

// Next 16: `retry()` re-fetches the segment, which also retries a failed server render.
export default function SiteErrorBoundary({ retry }: { readonly error: Error & { digest?: string }; readonly retry: () => void }) {
  return <ErrorState retry={retry} />;
}
