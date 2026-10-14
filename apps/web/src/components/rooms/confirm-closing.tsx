"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";

type ConfirmClosingProps = {
  /** Unique on the page: names the question's heading. */
  readonly id: string;
  /** The button that asks first. */
  readonly openLabel: string;
  /** Id of the note under the button. */
  readonly describedBy?: string;
  /** The warning's label, over the question (« Action définitive »). */
  readonly warning: string;
  readonly question: string;
  /** What closing does, said before it happens. */
  readonly consequences: readonly string[];
  readonly cancelLabel: string;
  /** The confirming request is on its way: keeping the room is no longer offered until it answers. */
  readonly busy?: boolean;
  /**
   * Where the focus goes once the room is kept: the opener by default. During a race, the typing
   * field, as « Continuer la course » does. A stable function (module scope).
   */
  readonly focusAfterKeeping?: (opener: HTMLButtonElement | null) => void;
  /** The form whose submit button confirms (it closes the room on the server), with its own answer. */
  readonly children: ReactNode;
};

/** The consequences' id, for the confirming button's `aria-describedby`: whoever reaches it hears them. */
export function consequencesId(id: string): string {
  return `${id}-consequences`;
}

function focusOpener(opener: HTMLButtonElement | null): void {
  opener?.focus();
}

/**
 * Closing the room for everyone always asks first (decided on 12 October), whether the host uses
 * « Fermer la salle » or leaves: the question takes the focus and spells out the consequences;
 * keeping the room open (the button or Escape) gives the focus back. The design's warning card
 * (`or` border, ⚠ label); keeping the room is the button, closing the red link (screen 12's
 * destructive action), so that it never competes with the screen's red primary.
 */
export function ConfirmClosing({
  id,
  openLabel,
  describedBy,
  warning,
  question,
  consequences,
  cancelLabel,
  busy = false,
  focusAfterKeeping = focusOpener,
  children,
}: ConfirmClosingProps) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (open) {
      asked.current = true;
      heading.current?.focus();
    } else if (asked.current) {
      focusAfterKeeping(opener.current);
    }
  }, [open, focusAfterKeeping]);

  if (!open) {
    return (
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-describedby={describedBy} className={`${discreetButton} self-start`}>
        {openLabel}
      </button>
    );
  }
  return (
    <section
      aria-labelledby={`${id}-question`}
      data-confirmation=""
      className={`${card} flex max-w-xl flex-col gap-3 border-or`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          setOpen(false);
        }
      }}
    >
      <p className={`${monoLabel} text-or`}>
        <span aria-hidden="true">⚠ </span>
        {warning}
      </p>
      <h2 id={`${id}-question`} ref={heading} tabIndex={-1} className="font-display text-2xl font-extrabold uppercase outline-none">
        {question}
      </h2>
      <div id={consequencesId(id)} className="flex flex-col gap-3">
        {consequences.map((line) => (
          <p key={line} className="text-embrun">
            {line}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={`${secondaryButton} disabled:cursor-progress disabled:opacity-60`}>
          {cancelLabel}
        </button>
        {children}
      </div>
    </section>
  );
}
