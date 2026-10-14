import type { ReactNode } from "react";
import { card, monoLabel } from "./styles";

/** Whether the focus is inside an open question: a key typed now is meant for it, never for the race. */
export function focusIsInQuestion(): boolean {
  const focused = document.activeElement;
  return focused !== null && focused.closest("[data-warning-question]") !== null;
}

type WarningQuestionProps = {
  /** Id of the question's heading, which the caller focuses when the question opens. */
  readonly labelledBy: string;
  /** The warning's label, over the question (« Action définitive »). */
  readonly warning: string;
  /** Escape keeps things as they are; the caller ignores it while an answer is on its way. */
  readonly onEscape: () => void;
  /** The heading, what the action does, then the answers: keeping as a button, the final action as screen 12's red link. */
  readonly children: ReactNode;
};

/**
 * A question before a final action (closing the room, the host's leave, giving up), in the
 * design's warning card: `or` border and ⚠ label, as the reconnection card. Marked so that the
 * race's field never takes the focus from it (see `focusIsInQuestion`).
 */
export function WarningQuestion({ labelledBy, warning, onEscape, children }: WarningQuestionProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      data-warning-question=""
      className={`${card} flex max-w-xl flex-col gap-3 border-or`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onEscape();
        }
      }}
    >
      <p className={`${monoLabel} text-or`}>
        <span aria-hidden="true">⚠ </span>
        {warning}
      </p>
      {children}
    </section>
  );
}
