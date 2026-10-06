"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  readonly label: ReactNode;
  readonly pendingLabel: string;
  readonly className: string;
  readonly name?: string;
  readonly value?: string;
  readonly ariaLabel?: string;
};

/** Submit button of the enclosing form; disabled and relabelled while its action runs. */
export function SubmitButton({ label, pendingLabel, className, name, value, ariaLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-label={pending ? undefined : ariaLabel} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}
