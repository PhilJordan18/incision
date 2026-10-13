"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { card, discreetButton } from "@/components/ui/styles";

type ConfirmClosingProps = {
  /** Unique on the page: names the question's heading. */
  readonly id: string;
  /** The button that asks first. */
  readonly openLabel: string;
  readonly openClassName?: string;
  /** Id of the note under the button. */
  readonly describedBy?: string;
  readonly question: string;
  /** What closing does, said before it happens. */
  readonly consequences: readonly string[];
  readonly cancelLabel: string;
  /** The form whose submit button confirms (it closes the room on the server). */
  readonly children: ReactNode;
};

/**
 * Closing the room for everyone always asks first (decided on 12 October), whether the host uses
 * « Fermer la salle » or leaves: the question takes the focus and spells out the consequences;
 * keeping the room open (the button or Escape) gives the focus back to the opener.
 */
export function ConfirmClosing({ id, openLabel, openClassName = `${discreetButton} self-start`, describedBy, question, consequences, cancelLabel, children }: ConfirmClosingProps) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (open) {
      asked.current = true;
      heading.current?.focus();
    } else if (asked.current) {
      opener.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-describedby={describedBy} className={openClassName}>
        {openLabel}
      </button>
    );
  }
  return (
    <section
      aria-labelledby={`${id}-question`}
      className={`${card} flex max-w-xl flex-col gap-3 border-erreur`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <h2 id={`${id}-question`} ref={heading} tabIndex={-1} className="font-display text-2xl font-extrabold uppercase outline-none">
        {question}
      </h2>
      {consequences.map((line) => (
        <p key={line} className="text-embrun">
          {line}
        </p>
      ))}
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => setOpen(false)} className={discreetButton}>
          {cancelLabel}
        </button>
        {children}
      </div>
    </section>
  );
}
