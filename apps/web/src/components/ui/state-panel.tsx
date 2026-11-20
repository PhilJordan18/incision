import type { ReactNode } from "react";
import { card, monoLabel } from "./styles";
import { PageHeading } from "./page-heading";
import { WaveMarks } from "@/components/nautical";

type StatePanelProps = {
  /** What kind of state, as a mono label; the sign keeps it readable without colour. */
  readonly label: string;
  readonly tone: "warning" | "error" | "neutral";
  readonly heading: { readonly bold: string; readonly serif?: string };
  readonly children: ReactNode;
  readonly actions: ReactNode;
  /** Id of the heading, for a view that moves the focus to it. */
  readonly headingId?: string;
  /** C1 (docs/da/v2): the wave marks in the corner of a room state, refusal or error panel. Decorative. */
  readonly waves?: boolean;
};

const TONES = {
  warning: { border: "border-or", text: "text-or", sign: "⚠" },
  error: { border: "border-erreur", text: "text-erreur", sign: "×" },
  neutral: { border: "border-houle", text: "text-brume", sign: "·" },
} as const;

/** System states (screen 15): what happens, why, and what to do. */
export function StatePanel({ label, tone, heading, children, actions, headingId, waves = false }: StatePanelProps) {
  const style = TONES[tone];
  return (
    <section className={`${card} ${style.border} flex max-w-xl flex-col gap-4${waves ? " relative overflow-hidden *:relative" : ""}`}>
      {waves && <CornerWaves />}
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

/**
 * The shared wave marks in the top right corner. Under 640 px, where the label can reach the
 * corner, a smaller box is drawn and it starts under the label's line: the marks may pass
 * behind the title, never behind text to read.
 */
function CornerWaves() {
  return (
    <div data-scene="corner-waves" aria-hidden="true" className="pointer-events-none !absolute top-0 right-0 opacity-70">
      {/* The shared drawing sets its own display: each size is shown or hidden by its wrapper. */}
      <div className="hidden sm:block"><WaveMarks width={220} height={90} className="h-[90px] w-[220px]" /></div>
      <div className="mt-11 sm:hidden"><WaveMarks width={125} height={70} className="h-[70px] w-[125px]" /></div>
    </div>
  );
}
