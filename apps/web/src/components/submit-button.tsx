"use client";

import type { MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  readonly label: ReactNode;
  readonly pendingLabel: string;
  readonly className: string;
  readonly name?: string;
  readonly value?: string;
  readonly ariaLabel?: string;
  /** Id of a note that explains the consequence of this action. */
  readonly describedBy?: string;
};

/**
 * Submit button of the enclosing form, relabelled while its action runs. It stays
 * focusable (`aria-disabled`, not `disabled`), so keyboard focus is not lost, and a second
 * activation is ignored while the first one runs.
 */
export function SubmitButton({ label, pendingLabel, className, name, value, ariaLabel, describedBy }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  function ignoreWhilePending(event: MouseEvent<HTMLButtonElement>): void {
    if (pending) {
      event.preventDefault();
    }
  }
  return (
    <button
      type="submit"
      name={name}
      value={value}
      aria-disabled={pending}
      onClick={ignoreWhilePending}
      aria-label={pending ? undefined : ariaLabel}
      aria-describedby={describedBy}
      className={`${className} aria-disabled:cursor-wait aria-disabled:opacity-80`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
