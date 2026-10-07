"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  readonly label: string;
  readonly pendingLabel: string;
  readonly name?: string;
  readonly value?: string;
  readonly variant?: "primary" | "secondary";
};

/** Submit button of the enclosing form; disabled and relabelled while its action runs. */
export function SubmitButton({ label, pendingLabel, name, value, variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const style =
    variant === "primary"
      ? "bg-foreground text-background hover:opacity-90"
      : "border border-foreground/40 hover:bg-foreground/5";
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex min-h-11 w-full items-center justify-center rounded-md px-4 py-2 font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-70 ${style}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
