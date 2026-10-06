import type { ReactNode } from "react";
import { card, monoLabel } from "./styles";
import { PageHeading } from "./page-heading";

type StatePanelProps = {
  /** What kind of state, as a mono label; the sign keeps it readable without colour. */
  readonly label: string;
  readonly tone: "warning" | "error" | "neutral";
  readonly heading: { readonly bold: string; readonly serif?: string };
  readonly children: ReactNode;
  readonly actions: ReactNode;
  /** Id of the heading, for a view that moves the focus to it. */
  readonly headingId?: string;
};

const TONES = {
  warning: { border: "border-or", text: "text-or", sign: "⚠" },
  error: { border: "border-erreur", text: "text-erreur", sign: "×" },
  neutral: { border: "border-houle", text: "text-brume", sign: "·" },
} as const;

/** System states (screen 15): what happens, why, and what to do. */
export function StatePanel({ label, tone, heading, children, actions, headingId }: StatePanelProps) {
  const style = TONES[tone];
  return (
    <section className={`${card} ${style.border} flex max-w-xl flex-col gap-4`}>
      <p className={`${monoLabel} ${style.text}`}>
        <span aria-hidden="true">{style.sign} </span>
        {label}
      </p>
      <PageHeading bold={heading.bold} serif={heading.serif} size="panel" id={headingId} />
      <div className="text-embrun">{children}</div>
      <div className="flex flex-wrap gap-3">{actions}</div>
    </section>
  );
}
