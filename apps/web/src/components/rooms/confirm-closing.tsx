"use client";

import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import { WarningQuestion } from "@/components/ui/warning-question";

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
  /** Where the focus goes once the room is kept: the opener by default; during a race, the typing field. */
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
 * keeping the room open (the button or Escape) gives the focus back. Keeping the room is the
 * button, closing the red link, so that it never competes with the screen's red primary.
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
  // Read when the question closes, never a reason to run the effect again.
  const giveFocusBack = useEffectEvent(() => focusAfterKeeping(opener.current));
  useEffect(() => {
    if (open) {
      asked.current = true;
      heading.current?.focus();
    } else if (asked.current) {
      giveFocusBack();
    }
  }, [open]);

  if (!open) {
    return (
      <button ref={opener} type="button" onClick={() => setOpen(true)} aria-describedby={describedBy} className={`${discreetButton} self-start`}>
        {openLabel}
      </button>
    );
  }
  return (
    <WarningQuestion
      id={`${id}-question`}
      headingRef={heading}
      warning={warning}
      question={question}
      onEscape={() => {
        if (!busy) {
          setOpen(false);
        }
      }}
    >
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
    </WarningQuestion>
  );
}
