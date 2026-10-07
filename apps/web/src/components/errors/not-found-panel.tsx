import Link from "next/link";
import { StatePanel } from "@/components/ui/state-panel";
import { secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";

/** "Page not found" state, inside whichever shell renders it. */
export function NotFoundPanel({ t }: { readonly t: Dictionary["notFound"] }) {
  return (
    <StatePanel
      tone="neutral"
      label={t.label}
      heading={{ bold: t.headingBold, serif: t.headingSerif }}
      actions={
        <Link href="/" className={secondaryButton}>
          {t.backHome}
        </Link>
      }
    >
      <p>{t.body}</p>
    </StatePanel>
  );
}
