"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { signOutEverywhereAction, type SignOutState } from "./actions";

type SignOutFormProps = {
  readonly labels: { readonly signOut: string; readonly signingOut: string; readonly signOutFailed: string };
};

export function SignOutForm({ labels }: SignOutFormProps) {
  const [state, formAction] = useActionState<SignOutState>(signOutEverywhereAction, { failed: false });
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.failed && (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {labels.signOutFailed}
        </p>
      )}
      <SubmitButton label={labels.signOut} pendingLabel={labels.signingOut} />
    </form>
  );
}
