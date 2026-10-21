import type { ReactNode, Ref } from "react";
import { card, monoLabel } from "./styles";

/** Whether the focus is inside an open question: a key typed now is meant for it, never for the race. */
export function focusIsInQuestion(): boolean {
  const focused = document.activeElement;
  return focused !== null && focused.closest("[data-warning-question]") !== null;
}

type WarningQuestionProps = {
  /** Id of the question's heading. */
  readonly id: string;
  /** The heading, which the caller focuses when the question opens. */
  readonly headingRef: Ref<HTMLHeadingElement>;
  /** The warning's label, over the question (« Action définitive »), heard with the heading. */
  readonly warning: string;
  readonly question: string;
  /** Escape keeps things as they are; the caller ignores it while an answer is on its way. */
  readonly onEscape: () => void;
  /** What the action does, then the answers: keeping as a button, the final action as screen 12's red link. */
  readonly children: ReactNode;
};

/**
 * A question before a final action (closing the room, the host's leave, giving up), in the
 * design's warning card: `or` border and ⚠ label, as the reconnection card. Marked so that the
 * race's field never takes the focus from it (see `focusIsInQuestion`).
 */
export function WarningQuestion({ id, headingRef, warning, question, onEscape, children }: WarningQuestionProps) {
  return (
    <section
      aria-labelledby={id}
      data-warning-question=""
      className={`${card} flex max-w-xl flex-col gap-3 border-or`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onEscape();
        }
      }}
    >
      <p id={`${id}-warning`} className={`${monoLabel} text-or`}>
        <span aria-hidden="true">⚠ </span>
        {warning}
      </p>
      <h2 id={id} ref={headingRef} tabIndex={-1} aria-describedby={`${id}-warning`} className="font-display text-2xl font-extrabold uppercase outline-none">
        {question}
      </h2>
      {children}
    </section>
  );
}
